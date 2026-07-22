// The specials (DESIGN §8.2–§8.5): the Angler (M15 rework: patrol → freeze-
// on-sight → the vortex — it takes your air, your position, and your
// certainty, never your HP), the LAMP MAN (a placed dread object with no AI:
// a light that stands, sharing the Angler's exact lure), the Silt Shade
// (alive exactly as long as its silt-out), and the Guardians (the condemned
// hard-suits, still walking their posts). Plus the Cathedral's biolum field.
// All numbers in tuning.specials.

import * as THREE from 'three';
import { EDGES, NODES, type CaveEdge, type CaveNode } from '../cave/data';
import { resolveCollision, sdf } from '../cave/sdf';
import { TUNING } from '../tuning';
import { softDotTexture } from '../effects/atmosphere';
import type { SiltSystem } from '../effects/silt';
import { GraphPath, nearestNodeId, type Vec3 } from './pathing';

export type SpecialKind = 'angler' | 'shade' | 'guardian' | 'lampman';

export interface Special {
  kind: SpecialKind;
  group: THREE.Group;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  hp: number;
  maxHp: number;
  state:
    | 'idle'
    | 'windup'
    | 'attack'
    | 'aggro'
    | 'returning'
    | 'dead'
    // M15 Angler states (DESIGN §8.2)
    | 'patrol'
    | 'frozen'
    | 'vortex'
    | 'leaving'
    | 'approach'
    // the Lamp Man only ever stands
    | 'standing';
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
  /** Guardian: smoothed pure-yaw orientation (the bob rides ON TOP — mixing
   *  euler writes with quaternion slerps inverted the suits). */
  smoothQ?: THREE.Quaternion;
  calmT: number;
  lureLight?: THREE.PointLight;
  fade: number;
  /** Angler (M15): current polyline (patrol/approach/carry/leave legs). */
  path?: Vec3[];
  pathIdx?: number;
  /** Angler frozen: seconds the player has been out of sight. */
  unseenT?: number;
  /** Vortex: where the player was when the inhale took hold. */
  vortexFrom?: THREE.Vector3;
  /** Lamp Man: the tunnel he stands in + whether he has been SEEN. */
  edgeId?: string;
  lampSeen?: boolean;
}

export interface SpecialCtx {
  playerPos: THREE.Vector3;
  playerDead: boolean;
  time: number;
  lampOn: boolean;
  sprinting: boolean;
  /** Camera forward (the Lamp Man's "looking toward him" check). */
  lookDir: THREE.Vector3;
  /** A special's hit lands on the player. */
  onHit: (damage: number, fromDir: THREE.Vector3, airLoss: number) => void;
}

const Z_AXIS = new THREE.Vector3(0, 0, 1);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

export interface SpecialHooks {
  toast: (m: string) => void;
  award: (n: number) => void;
  dropBattery: (pos: THREE.Vector3) => void;
  /** M15: the Angler's rare output-slug echo (deferred from M13a). */
  dropSlug: (pos: THREE.Vector3) => void;
  /** M15 vortex phases: 'grab' pins HR + starts the drag audio; 'carry'
   *  forces the player to `point` each tick; 'release' lets go. */
  onVortex: (phase: 'grab' | 'carry' | 'release', point?: THREE.Vector3) => void;
  /** M15 Lamp Man: first sighting (VO triggers) and the too-close scare. */
  onLampSeen: () => void;
  onLampScare: () => void;
}

export class SpecialManager {
  readonly specials: Special[] = [];
  /** Guardians downed this round — they walk again next round. */
  private downedPosts: string[] = [];
  private ray = new THREE.Raycaster();
  private vTmp = new THREE.Vector3();
  private vTmp2 = new THREE.Vector3();
  /** Dedicated vortex vectors — vTmp is clobbered by followPath (the M15
   *  aliasing bug: the carry hook once received the ORIGIN). */
  private vMouth = new THREE.Vector3();
  private vDir = new THREE.Vector3();
  private qTmp = new THREE.Quaternion();
  private shootables: THREE.Mesh[] = [];
  /** Squeeze-free door-aware pathing (the Angler's tunnels). */
  private graph: GraphPath;
  /** The Lamp Man's candidate tunnels + where he stood last (never twice). */
  private lampEdges: CaveEdge[];
  private lampEdgeLast: string | null = null;

  constructor(
    private scene: THREE.Scene,
    private silt: SiltSystem,
    private hooks: SpecialHooks,
    isEdgeOpen: (e: CaveEdge) => boolean = () => true,
  ) {
    this.graph = new GraphPath((e) => isEdgeOpen(e) && e.width !== 'squeeze');
    // normal-width, doorless, fully-in-the-Maze tunnels (DESIGN §8.5)
    const mazeIds = new Set(NODES.filter((n) => n.zone === 'maze' && !n.dry && !n.teaser && n.kind !== 'audio').map((n) => n.id));
    this.lampEdges = EDGES.filter((e) => e.width === 'normal' && !e.door && mazeIds.has(e.a) && mazeIds.has(e.b));
    for (const n of NODES.filter((x) => x.tags.includes('guardianPost'))) this.spawnGuardian(n);
    this.buildBiolum();
  }

  /** SDF line-of-sight in open water (same discipline as the Drowned's). */
  private hasLos(from: THREE.Vector3, to: THREE.Vector3, maxD: number): boolean {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz);
    if (len > maxD) return false;
    const steps = Math.ceil(len / 0.6);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (sdf(from.x + dx * t, from.y + dy * t, from.z + dz * t) > -0.15) return false;
    }
    return true;
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

  /** THE lure — one builder, used by the Angler AND the Lamp Man, so the
   *  two lights are pixel-identical by construction (DESIGN §8.5). */
  private buildLure(g: THREE.Group, x: number, y: number, z: number): THREE.PointLight {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: softDotTexture(), color: 0x8fd44a, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    sprite.scale.setScalar(0.55);
    sprite.position.set(x, y, z);
    g.add(sprite);
    const light = new THREE.PointLight(0x6fd44a, 2.5, 7, 2);
    light.position.copy(sprite.position);
    g.add(light);
    return light;
  }

  /** The Angler: near-black body, a chemlight-green lure on a stalk. */
  spawnAngler(nodeId: string): Special {
    const n = NODES.find((x) => x.id === nodeId) ?? NODES[0];
    const g = new THREE.Group();
    const body = this.mat(0x0b1012, { roughness: 0.6, metalness: 0.2 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.6, 1.4), body);
    g.add(torso);
    // the rig faces +Z (faceVel aligns +Z with travel — user report: the
    // fish swam tail-first; jaw/tail/stalk all flipped 2026-07-21)
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.5), body);
    jaw.position.set(0, -0.24, 0.75);
    g.add(jaw);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.5), body);
    tail.position.set(0, 0.05, -0.9);
    g.add(tail);
    // the stalk + the lie: a glow that reads EXACTLY like a chemlight —
    // hung ahead of the FACE (+Z), where an angler's lure belongs
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.9, 5), body);
    stalk.rotation.x = -0.9;
    stalk.position.set(0, 0.55, 0.85);
    g.add(stalk);
    g.position.set(n.pos[0], n.pos[1], n.pos[2]);
    const s = this.makeSpecial('angler', g, TUNING.specials.angler.hp, g.position.clone());
    s.lureLight = this.buildLure(g, 0, 0.92, 1.2);
    this.register(s);
    s.state = 'patrol'; // M15: the lure walks the Maze
    return s;
  }

  /** The Lamp Man (M15, DESIGN §8.5): he stands mid-tunnel on the floor,
   *  bolt upright along TRUE up, and his lamp is the Angler's lure. He has
   *  no AI, no pathing, no hitbox — a placed dread object. */
  spawnLampMan(edgeId?: string): Special | null {
    const pool = this.lampEdges.filter((e) => `${e.a}~${e.b}` !== this.lampEdgeLast);
    const edge = edgeId ? this.lampEdges.find((e) => `${e.a}~${e.b}` === edgeId) : pool[Math.floor(Math.random() * pool.length)];
    if (!edge) return null;
    this.despawnLampMan(); // never two lamps
    // arc-length midpoint of the passage polyline
    const a = NODES.find((n) => n.id === edge.a)!;
    const b = NODES.find((n) => n.id === edge.b)!;
    const pts: Vec3[] = [a.pos, ...(edge.waypoints ?? []), b.pos];
    let total = 0;
    const segs: number[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1], pts[i + 1][2] - pts[i][2]);
      segs.push(L);
      total += L;
    }
    let want = total / 2;
    let mid: Vec3 = pts[0];
    for (let i = 0; i < segs.length; i++) {
      if (want <= segs[i]) {
        const t = segs[i] > 0 ? want / segs[i] : 0;
        mid = [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t, pts[i][2] + (pts[i + 1][2] - pts[i][2]) * t];
        break;
      }
      want -= segs[i];
    }
    // TRUE-down floor probe — in a lying region his verticality is the tell
    let floorY = mid[1] - 1.2;
    for (let d = 0.2; d < 8; d += 0.2) {
      if (sdf(mid[0], mid[1] - d, mid[2]) >= -0.1) {
        floorY = mid[1] - d;
        break;
      }
    }
    const g = new THREE.Group();
    // the figure: a standing dark where a body should be — shots pass through
    const dark = this.mat(0x05070a, { roughness: 1 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.62, 0.24), dark);
    torso.position.y = 1.12;
    g.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.22), dark);
    head.position.y = 1.58;
    g.add(head);
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.82, 0.17), dark);
      leg.position.set(sx * 0.12, 0.41, 0);
      g.add(leg);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.58, 0.12), dark);
      arm.position.set(sx * 0.3, 1.08, 0);
      g.add(arm);
    }
    g.position.set(mid[0], floorY, mid[2]);
    const s = this.makeSpecial('lampman', g, 1, g.position.clone());
    // held at his side — "lamps hang or they're held"
    s.lureLight = this.buildLure(g, 0.36, 0.72, 0.08);
    s.edgeId = `${edge.a}~${edge.b}`;
    this.lampEdgeLast = s.edgeId;
    s.state = 'standing';
    // NOT registered as shootable: raycasts never see him (never confirmed
    // either way — DESIGN §8.5)
    this.specials.push(s);
    this.scene.add(s.group);
    return s;
  }

  /** He is gone. No fade, no fuss — the vanish is the point. */
  despawnLampMan(): void {
    for (let i = this.specials.length - 1; i >= 0; i--) {
      if (this.specials[i].kind === 'lampman') this.vanish(i);
    }
  }

  get lampMan(): Special | null {
    return this.specials.find((s) => s.kind === 'lampman') ?? null;
  }

  /** Instant silent removal (the Lamp Man's exits; the Angler leaving). */
  private vanish(index: number): void {
    const s = this.specials[index];
    this.scene.remove(s.group);
    this.shootables = this.shootables.filter((m) => m.userData.special !== s);
    this.specials.splice(index, 1);
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

  /** Shift rollover: guardian respawns, the Angler's spawn roll, and the
   *  Lamp Man's 7-shift cadence (DESIGN §8.5). */
  onRoundStart(round: number, playerPos: THREE.Vector3): void {
    for (const postId of this.downedPosts) {
      const n = NODES.find((x) => x.id === postId);
      if (n) this.spawnGuardian(n); // the suit walks its post again
    }
    this.downedPosts = [];
    const A = TUNING.specials.angler;
    if (round >= A.fromRound && !this.anglerAlive && Math.random() < A.spawnChanceAtRoundStart) {
      // M15: it patrols the MAZE — it spawns there too
      const darks = NODES.filter(
        (n) =>
          n.zone === 'maze' &&
          !n.dry &&
          !n.teaser &&
          n.kind !== 'audio' &&
          Math.hypot(n.pos[0] - playerPos.x, n.pos[1] - playerPos.y, n.pos[2] - playerPos.z) > A.minSpawnDistM,
      );
      if (darks.length) this.spawnAngler(darks[Math.floor(Math.random() * darks.length)].id);
    }
    // every Nth shift the lamp relocates — despawn + fresh tunnel (rule 3)
    const L = TUNING.specials.lampman;
    if (round > 0 && round % L.everyShifts === 0) this.spawnLampMan();
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
      if (s.kind === 'angler') {
        if (this.updateAngler(s, dt, ctx, dist)) this.vanish(i); // swam out of sight
      } else if (s.kind === 'lampman') {
        if (this.updateLampMan(s, dt, ctx, dist)) this.vanish(i);
      } else if (s.kind === 'shade') this.updateShade(s, dt, ctx, dist);
      else this.updateGuardian(s, dt, ctx, dist);
    }

    // ── guardian separation (user 2026-07-21: "they usually walk inside of
    // each other") — the suits shoulder apart like the Drowned do ──
    const suits = this.specials.filter((s) => s.kind === 'guardian' && s.state !== 'dead');
    for (let a = 0; a < suits.length; a++) {
      for (let b = a + 1; b < suits.length; b++) {
        this.vTmp.copy(suits[b].pos).sub(suits[a].pos);
        let d = this.vTmp.length();
        if (d >= 1.7) continue;
        if (d < 1e-3) {
          this.vTmp.set(Math.random() - 0.5, 0, Math.random() - 0.5);
          d = this.vTmp.length();
        }
        this.vTmp.normalize();
        const push = Math.min(((1.7 - d) / 2) * 2.0 * dt, 2.5 * dt);
        suits[a].pos.addScaledVector(this.vTmp, -push);
        suits[b].pos.addScaledVector(this.vTmp, push);
        resolveCollision(suits[a].pos, 0.7);
        resolveCollision(suits[b].pos, 0.7);
      }
    }
  }

  // ── the Angler's legs: polyline follow at a given speed ──
  private followPath(s: Special, dt: number, speed: number): boolean {
    const path = s.path;
    if (!path || path.length === 0) return true;
    let idx = s.pathIdx ?? 0;
    const t = path[Math.min(idx, path.length - 1)];
    this.vTmp.set(t[0] - s.pos.x, t[1] - s.pos.y, t[2] - s.pos.z);
    const d = this.vTmp.length();
    if (d < 1.2) {
      idx++;
      s.pathIdx = idx;
      if (idx >= path.length) return true; // arrived
    }
    s.vel.lerp(this.vTmp.normalize().multiplyScalar(speed), Math.min(1, dt * 2.5));
    return false;
  }

  /** Path the fish from where it is to a node id (squeeze-free, door-aware).
   *  Starts at the polyline point nearest the fish — a repath must never
   *  send it doubling back to a node it already passed (observed: the
   *  approach oscillated 36→40 m forever on the 2 s repath cadence). */
  private pathTo(s: Special, toId: string): boolean {
    const from = nearestNodeId(s.pos.x, s.pos.y, s.pos.z);
    const ids = this.graph.findPath(from, toId);
    if (!ids || ids.length < 1) return false;
    const pts = this.graph.expand(ids);
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = (pts[i][0] - s.pos.x) ** 2 + (pts[i][1] - s.pos.y) ** 2 + (pts[i][2] - s.pos.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    s.path = pts;
    s.pathIdx = Math.min(best + 1, pts.length - 1);
    return true;
  }

  /** Random swimmable node, graph-reachable, with path length in a hop band. */
  private pickTarget(s: Special, minHops: number, maxHops: number): boolean {
    const from = nearestNodeId(s.pos.x, s.pos.y, s.pos.z);
    const pool = NODES.filter((n) => !n.dry && !n.teaser && n.kind !== 'audio' && n.id !== from);
    for (let tries = 0; tries < 14; tries++) {
      const n = pool[Math.floor(Math.random() * pool.length)];
      const ids = this.graph.findPath(from, n.id);
      if (ids && ids.length - 1 >= minHops && ids.length - 1 <= maxHops) return this.pathTo(s, n.id);
    }
    return false;
  }

  /** Random MAZE patrol target (any reachable hop count). */
  private pickPatrolTarget(s: Special): void {
    const from = nearestNodeId(s.pos.x, s.pos.y, s.pos.z);
    const maze = NODES.filter((n) => n.zone === 'maze' && !n.dry && !n.teaser && n.kind !== 'audio' && n.id !== from);
    for (let tries = 0; tries < 10; tries++) {
      const n = maze[Math.floor(Math.random() * maze.length)];
      if (this.pathTo(s, n.id)) return;
    }
    s.path = [];
  }

  /** M15 (DESIGN §8.2): patrol → freeze-on-sight → vortex → leave. Returns
   *  true when the fish has swum out of sight and should despawn. */
  private updateAngler(s: Special, dt: number, ctx: SpecialCtx, dist: number): boolean {
    const A = TUNING.specials.angler;
    const still = s.state === 'frozen' || s.state === 'vortex';
    // frozen it is DEAD still — a constant lamp, exactly like the standing one
    if (s.lureLight) s.lureLight.intensity = still ? 2.5 : 2.5 + Math.sin(ctx.time * 2.1 + s.phase) * 0.6;

    if (s.state === 'patrol') {
      const sees = this.hasLos(s.pos, ctx.playerPos, A.seeM);
      if (sees) {
        // it sees you: perfectly still — indistinguishable from the Lamp Man
        s.state = 'frozen';
        s.stateT = 0;
        s.unseenT = 0;
      } else {
        if (!s.path || s.path.length === 0 || this.followPath(s, dt, A.patrolSpeed)) this.pickPatrolTarget(s);
        s.vel.y += Math.sin(ctx.time * 0.9 + s.phase) * A.lureBobAmp * dt; // the lure sways as it swims
      }
    } else if (s.state === 'frozen') {
      s.vel.multiplyScalar(Math.max(0, 1 - 6 * dt));
      // dead still — and ALWAYS facing you, exactly like the Lamp Man (user
      // 2026-07-21): direct yaw, no witnessed turn. From any approach you
      // get the same silhouette and the same forward-hung lure — the two
      // still lights stay indistinguishable by construction.
      s.group.rotation.set(0, Math.atan2(ctx.playerPos.x - s.pos.x, ctx.playerPos.z - s.pos.z), 0);
      if (dist < A.vortexTriggerM) this.beginVortex(s, ctx);
      else if (!this.hasLos(s.pos, ctx.playerPos, A.seeM)) {
        s.unseenT = (s.unseenT ?? 0) + dt;
        if (s.unseenT >= A.unseeSec) {
          s.state = 'patrol';
          s.path = [];
        }
      } else s.unseenT = 0;
    } else if (s.state === 'approach') {
      // provoked (shot at range): a slow, deliberate closing — never faster
      // than a sprinting diver — and the attack on arrival IS the vortex
      if (dist < A.vortexTriggerM) this.beginVortex(s, ctx);
      else {
        s.calmT -= dt;
        if (s.calmT <= 0 || !s.path || s.path.length === 0) {
          this.pathTo(s, nearestNodeId(ctx.playerPos.x, ctx.playerPos.y, ctx.playerPos.z));
          s.calmT = 2; // repath cadence
        }
        this.followPath(s, dt, A.approachSpeed);
      }
    } else if (s.state === 'vortex') {
      if (s.stateT < A.inhaleSec) {
        // dragged in: player interpolates from where the water took hold
        s.vel.multiplyScalar(Math.max(0, 1 - 4 * dt));
        const t = Math.min(1, s.stateT / A.inhaleSec);
        this.mouthPoint(s, this.vMouth);
        this.vMouth.lerpVectors(s.vortexFrom ?? ctx.playerPos, this.vMouth, t * t);
        this.hooks.onVortex('carry', this.vMouth);
      } else {
        // carried: the fish runs its tunnel line with you in its mouth —
        // the mouth point is computed AFTER the move (fresh, un-aliased)
        const done = this.followPath(s, dt, A.carrySpeed);
        s.pos.addScaledVector(s.vel, dt);
        resolveCollision(s.pos, 0.5);
        this.mouthPoint(s, this.vMouth);
        this.hooks.onVortex('carry', this.vMouth);
        if (done || s.stateT > A.inhaleSec + A.carryMaxSec) {
          this.hooks.onVortex('release');
          s.state = 'leaving';
          s.stateT = 0;
          if (!this.pickTarget(s, 2, 6)) s.path = [];
        }
        this.faceVel(s, dt);
        return false; // position already integrated this tick
      }
    } else if (s.state === 'leaving') {
      if (!s.path || s.path.length === 0 || this.followPath(s, dt, A.leaveSpeed)) {
        if (!this.pickTarget(s, 2, 6)) s.path = [];
      }
      // gone the moment nobody can say where it went
      if (dist > A.despawnOutOfSightM && !this.hasLos(s.pos, ctx.playerPos, A.despawnOutOfSightM + 20)) return true;
    }

    s.pos.addScaledVector(s.vel, dt);
    resolveCollision(s.pos, 0.5);
    if (!still) this.faceVel(s, dt);
    return false;
  }

  /** The mouth: just ahead of the jaw, along current travel. */
  private mouthPoint(s: Special, out: THREE.Vector3): void {
    if (s.vel.lengthSq() > 0.05) this.vDir.copy(s.vel).normalize();
    else this.vDir.set(0, 0, 1).applyQuaternion(s.group.quaternion);
    out.copy(s.pos).addScaledVector(this.vDir, 0.8);
  }

  /** The inhale takes hold. */
  private beginVortex(s: Special, ctx: SpecialCtx): void {
    const A = TUNING.specials.angler;
    s.state = 'vortex';
    s.stateT = 0;
    s.vortexFrom = ctx.playerPos.clone();
    // the carry destination: a DIFFERENT room, a few tunnels over
    if (!this.pickTarget(s, A.carryMinHops, A.carryMinHops + 2)) this.pickTarget(s, 1, 8);
    this.hooks.onVortex('grab');
  }

  /** The Lamp Man (DESIGN §8.5): he does nothing at all — that is the whole
   *  mechanism. Returns true when he should vanish. */
  private updateLampMan(s: Special, dt: number, ctx: SpecialCtx, dist: number): boolean {
    const L = TUNING.specials.lampman;
    if (s.lureLight) s.lureLight.intensity = 2.5; // constant — the still light
    // he is ALWAYS facing you (user 2026-07-21) — no turn is ever witnessed;
    // whenever you look, he was already looking. Yaw only: true-up stance.
    s.group.rotation.set(0, Math.atan2(ctx.playerPos.x - s.pos.x, ctx.playerPos.z - s.pos.z), 0);
    // rule 2: too close → the jumpscare, and he is gone before vision settles
    if (dist < L.scareM) {
      this.hooks.onLampScare();
      return true;
    }
    // SEEN: near enough, clear water, and actually looking toward him
    if (!s.lampSeen && dist < L.seenM && this.hasLos(s.pos, ctx.playerPos, L.seenM)) {
      this.vTmp.copy(s.pos).sub(ctx.playerPos).normalize();
      if (this.vTmp.dot(ctx.lookDir) > Math.cos(THREE.MathUtils.degToRad(L.seenFacingDeg))) {
        s.lampSeen = true;
        this.hooks.onLampSeen();
      }
    }
    // rule 1: seen, then left alone → quietly gone
    if (s.lampSeen) {
      if (dist > L.leaveM) {
        s.calmT += dt;
        if (s.calmT >= L.leaveSec) return true;
      } else s.calmT = 0;
    }
    return false;
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
    // the walk: ponderous bob — a quaternion on top of the smoothed yaw
    // (a bare rotation.z write after the slerp flipped suits upside-down)
    if (s.smoothQ) {
      this.qTmp.setFromAxisAngle(Z_AXIS, Math.sin(ctx.time * 2.2 + s.phase) * 0.05);
      s.group.quaternion.copy(s.smoothQ).multiply(this.qTmp);
    }
  }

  private faceVel(s: Special, dt: number, at?: THREE.Vector3): void {
    this.vTmp2.copy(at ? this.vTmp.copy(at).sub(s.pos) : s.vel);
    if (s.kind === 'guardian') {
      // suits are HEAVY: yaw only, boots always down. Two past inverters
      // (user report 2026-07-21: "often upside down"): setFromUnitVectors
      // added arbitrary roll, and writing rotation.z after a slerp
      // recomposed yaw>90° eulers with x=π. The smoothed yaw lives in its
      // own quaternion now; the walk-bob multiplies on top in updateGuardian.
      if (this.vTmp2.x * this.vTmp2.x + this.vTmp2.z * this.vTmp2.z < 0.01) return;
      s.smoothQ ??= s.group.quaternion.clone();
      this.qTmp.setFromAxisAngle(Y_AXIS, Math.atan2(this.vTmp2.x, this.vTmp2.z));
      s.smoothQ.slerp(this.qTmp, Math.min(1, dt * 3));
      s.group.quaternion.copy(s.smoothQ);
      return;
    }
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
      if (s.state === 'dead' || s.kind === 'lampman') continue; // the knife finds nothing there
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
    // the Lamp Man is not shootable — this path should never even reach him
    // (he has no hitbox), but nothing may ever confirm a hit either way
    if (s.kind === 'lampman') return 'hit';
    s.hp -= dmg;
    s.hitFlash = 1;
    if (s.hp > 0) {
      // M15: shooting the Angler at range PROVOKES it — it stops patrolling
      // and comes for you, slowly and deliberately
      if (s.kind === 'angler' && (s.state === 'patrol' || s.state === 'frozen' || s.state === 'leaving')) {
        s.state = 'approach';
        s.stateT = 0;
        s.calmT = 0;
        s.path = [];
      }
      return 'hit';
    }
    s.hp = 0;
    if (s.kind === 'angler' && s.state === 'vortex') this.hooks.onVortex('release'); // killed mid-drag: it lets go
    s.state = 'dead';
    s.stateT = 0;
    if (s.kind === 'angler') {
      this.hooks.dropBattery(s.pos.clone());
      if (Math.random() < TUNING.specials.angler.slugDropChance) this.hooks.dropSlug(s.pos.clone()); // the rare echo (M13a debt)
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

  /** Debug. (The Lamp Man is unkillable — he simply leaves.) */
  killAllSpecials(): void {
    for (const s of this.specials) if (s.state !== 'dead' && s.kind !== 'lampman') this.applyDamage(s, s.hp + 1);
    this.despawnLampMan();
  }

  /** Debug: shove the Angler into a state (force Angler states, M15 DoD). */
  forceAnglerState(state: 'patrol' | 'frozen' | 'approach' | 'leaving'): void {
    const a = this.specials.find((s) => s.kind === 'angler' && s.state !== 'dead');
    if (!a) return;
    if (a.state === 'vortex') this.hooks.onVortex('release'); // never strand the drag
    a.state = state;
    a.stateT = 0;
    a.path = [];
    a.unseenT = 0;
    a.calmT = 0;
  }
}
