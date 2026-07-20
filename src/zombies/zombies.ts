// The Drowned: spawning, pursuit, attacks, deaths (DESIGN §8.1, §13).
// Pathing = A* on the authored graph (pathing.ts) + local steering here;
// burrow spawning keeps the site at complement (LORE §1.1). All numbers in
// tuning.ts.

import * as THREE from 'three';
import { TUNING } from '../tuning';
import { NODES, type CaveNode } from '../cave/data';
import { gradient, regionAt, resolveCollision, sdf } from '../cave/sdf';
import { sampleCurrent } from '../player/current';
import { GraphPath, nearestNodeId, refToNodeId, type Vec3 } from './pathing';
import { RoundSystem, roundHp, roundSpeed } from './rounds';
import { animateDrowned, buildDrowned, DROWNED_VARIANTS, type DrownedPose, type DrownedRig } from './drowned';

export type ZombieState = 'emerging' | 'pursuing' | 'attacking' | 'pausing' | 'dead';

export interface Zombie {
  id: number;
  rig: DrownedRig;
  pos: THREE.Vector3; // = rig.group.position
  vel: THREE.Vector3;
  hp: number;
  maxHp: number;
  speed: number;
  state: ZombieState;
  stateT: number; // time in current state (emerge/windup/pause/corpse)
  phase: number; // per-zombie animation offset
  path: Vec3[];
  pathIdx: number;
  repathT: number;
  playerNodeAtPath: string;
  grabCooldown: number;
  pauseCooldown: number;
  stuckT: number;
  lastPos: THREE.Vector3;
  hitFlash: number;
  fading: boolean;
}

export interface ShotResult {
  kind: 'none' | 'wall' | 'zombie';
  point: [number, number, number];
  dist: number;
  zombie?: Zombie;
  head?: boolean;
}

export interface ZombieCtx {
  playerPos: THREE.Vector3;
  playerDead: boolean;
  time: number;
  /** The grab lands: damage, −air, tilt kick — main owns the player side. */
  onGrab: (fromDir: THREE.Vector3) => void;
}

const Z_AXIS = new THREE.Vector3(0, 0, 1);

export class ZombieManager {
  readonly zombies: Zombie[] = [];
  /** Kills this run (Lowe's ledger — the stats screens read it). */
  recovered = 0;
  private nextId = 1;
  private graph: GraphPath;
  private burrows: CaveNode[];
  private stations: Vec3[];
  private shootables: THREE.Mesh[] = [];
  private playerNodeId = 'sink-pool';
  private ray = new THREE.Raycaster();
  private vTmp = new THREE.Vector3();
  private vTmp2 = new THREE.Vector3();
  private qTmp = new THREE.Quaternion();
  private current = new THREE.Vector3();

  constructor(
    private scene: THREE.Scene,
    readonly rounds: RoundSystem,
    isEdgeOpen: (e: import('../cave/data').CaveEdge) => boolean,
    private waterLevelAt: (x: number, y: number, z: number) => number | null,
  ) {
    this.graph = new GraphPath(isEdgeOpen);
    this.burrows = NODES.filter((n) => n.tags.includes('burrow'));
    // old workstations: facility-tagged spots the crew pauses at, as if
    // remembering a task (LORE §4 directive — cheap idle, deeply wrong)
    const stationTags = ['perk', 'wallBuy', 'boxSpot', 'power', 'pap', 'jukebox'] as const;
    this.stations = NODES.filter((n) => stationTags.some((t) => n.tags.includes(t))).map((n) => [...n.pos]);
  }

  get aliveCount(): number {
    return this.zombies.filter((z) => z.state !== 'dead').length;
  }

  /** Spawn one Drowned at a node (burrow spawning + the debug button). */
  spawnAt(nodeId: string, round: number): Zombie {
    const n = NODES.find((x) => x.id === nodeId);
    const pos = n ? n.pos : [0, -5, 0];
    const rig = buildDrowned(this.nextId % DROWNED_VARIANTS);
    rig.group.position.set(pos[0], pos[1] - 0.4, pos[2]);
    rig.group.scale.setScalar(0.4);
    this.scene.add(rig.group);
    const z: Zombie = {
      id: this.nextId++,
      rig,
      pos: rig.group.position,
      vel: new THREE.Vector3(),
      hp: roundHp(round),
      maxHp: roundHp(round),
      speed: roundSpeed(round),
      state: 'emerging',
      stateT: 0,
      phase: Math.random() * 20,
      path: [],
      pathIdx: 0,
      repathT: Math.random() * TUNING.zombies.repathSec,
      playerNodeAtPath: '',
      grabCooldown: 0,
      pauseCooldown: 6,
      stuckT: 0,
      lastPos: rig.group.position.clone(),
      hitFlash: 0,
      fading: false,
    };
    this.zombies.push(z);
    for (const m of rig.meshes) {
      m.userData.zombie = z;
      this.shootables.push(m);
    }
    return z;
  }

  /** Pick a burrow for the next spawn (DESIGN §5.1/§13): active this round,
   *  ≥12 m from the player, out of sight and same-zone preferred. */
  private pickBurrow(playerPos: THREE.Vector3, round: number): string | null {
    const Z = TUNING.zombies;
    const playerZone = regionAt(playerPos.x, playerPos.y, playerPos.z)?.zone;
    let best: CaveNode | null = null;
    let bestScore = Infinity;
    let farthest: CaveNode | null = null;
    let farthestD = -1;
    for (const b of this.burrows) {
      const from = b.contents?.burrowActiveFromRound ?? 1;
      if (round < from) continue;
      const d = Math.hypot(b.pos[0] - playerPos.x, b.pos[1] - playerPos.y, b.pos[2] - playerPos.z);
      if (d > farthestD) {
        farthestD = d;
        farthest = b;
      }
      if (d < Z.minSpawnDistM) continue;
      let score = d;
      if (this.hasLos(b.pos[0], b.pos[1], b.pos[2], playerPos, 30)) score += 40; // avoid spawning in view
      if (playerZone && b.zone !== playerZone) score += 15; // prefer the player's zone
      if (score < bestScore) {
        bestScore = score;
        best = b;
      }
    }
    return (best ?? farthest)?.id ?? null;
  }

  /** SDF line-of-sight: clear water the whole way? */
  private hasLos(x: number, y: number, z: number, to: THREE.Vector3, maxD: number): boolean {
    const dx = to.x - x;
    const dy = to.y - y;
    const dz = to.z - z;
    const len = Math.hypot(dx, dy, dz);
    if (len > maxD) return false;
    const steps = Math.ceil(len / 0.6);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (sdf(x + dx * t, y + dy * t, z + dz * t) > -0.15) return false;
    }
    return true;
  }

  private repath(z: Zombie): void {
    const zNode = refToNodeId(regionAt(z.pos.x, z.pos.y, z.pos.z)?.ref ?? nearestNodeId(z.pos.x, z.pos.y, z.pos.z), z.pos.x, z.pos.y, z.pos.z);
    const path = this.graph.findPath(zNode, this.playerNodeId);
    z.path = path ? this.graph.expand(path) : [];
    z.pathIdx = 0; // pathTarget re-projects from scratch
    z.playerNodeAtPath = this.playerNodeId;
    z.repathT = TUNING.zombies.repathSec * (0.8 + Math.random() * 0.5);
  }

  /**
   * Path following: project onto the polyline (searching from the current
   * segment so a path that doubles back can't yank us onto the wrong leg —
   * the M4 reel lesson), then aim `lookahead` meters ALONG the line. Steering
   * at a far vertex through a curved passage pins zombies on walls; steering
   * along the polyline never does — every polyline point is open water.
   */
  private pathTarget(z: Zombie, lookahead: number): Vec3 | null {
    const pts = z.path;
    if (pts.length === 0) return null;
    if (pts.length === 1) return pts[0];
    let bestSeg = 0;
    let bestT = 0;
    let bestD = Infinity;
    for (let i = Math.max(0, z.pathIdx - 1); i < pts.length - 1; i++) {
      const [ax, ay, az] = pts[i];
      const [bx, by, bz] = pts[i + 1];
      const abx = bx - ax;
      const aby = by - ay;
      const abz = bz - az;
      const len2 = abx * abx + aby * aby + abz * abz || 1;
      let t = ((z.pos.x - ax) * abx + (z.pos.y - ay) * aby + (z.pos.z - az) * abz) / len2;
      t = Math.max(0, Math.min(1, t));
      const qx = ax + abx * t;
      const qy = ay + aby * t;
      const qz = az + abz * t;
      const d = (z.pos.x - qx) ** 2 + (z.pos.y - qy) ** 2 + (z.pos.z - qz) ** 2;
      if (d < bestD) {
        bestD = d;
        bestSeg = i;
        bestT = t;
      }
    }
    z.pathIdx = bestSeg;
    let seg = bestSeg;
    let t = bestT;
    let remaining = lookahead;
    for (;;) {
      const [ax, ay, az] = pts[seg];
      const [bx, by, bz] = pts[seg + 1];
      const segLen = Math.hypot(bx - ax, by - ay, bz - az) || 1e-6;
      const leftInSeg = (1 - t) * segLen;
      if (remaining <= leftInSeg || seg >= pts.length - 2) {
        const nt = Math.min(1, t + remaining / segLen);
        return [ax + (bx - ax) * nt, ay + (by - ay) * nt, az + (bz - az) * nt];
      }
      remaining -= leftInSeg;
      seg++;
      t = 0;
    }
  }

  update(dt: number, ctx: ZombieCtx): void {
    const Z = TUNING.zombies;
    // player's current graph node (shared by every pursuer)
    const ref = regionAt(ctx.playerPos.x, ctx.playerPos.y, ctx.playerPos.z)?.ref;
    if (ref) this.playerNodeId = refToNodeId(ref, ctx.playerPos.x, ctx.playerPos.y, ctx.playerPos.z);

    // spawning (rounds own pacing/caps; we own burrow choice)
    if (!ctx.playerDead && this.rounds.wantSpawn(this.aliveCount)) {
      const burrow = this.pickBurrow(ctx.playerPos, this.rounds.round);
      if (burrow) this.spawnAt(burrow, this.rounds.round);
    }

    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      z.stateT += dt;
      z.hitFlash = Math.max(0, z.hitFlash - dt * 4);
      z.grabCooldown = Math.max(0, z.grabCooldown - dt);
      z.pauseCooldown = Math.max(0, z.pauseCooldown - dt);
      const emissive = z.hitFlash * 0.55;
      for (const m of z.rig.mats) m.emissive.setRGB(emissive, emissive * 0.9, emissive * 0.8);

      if (z.state === 'dead') {
        this.updateCorpse(z, i, dt, ctx.time);
        continue;
      }

      const distToPlayer = z.pos.distanceTo(ctx.playerPos);
      const lvl = this.waterLevelAt(z.pos.x, z.pos.y, z.pos.z);
      const headAbove = lvl !== null && z.pos.y > lvl;

      // ── state transitions ──
      if (z.state === 'emerging') {
        const t = Math.min(1, z.stateT / Z.emergeSec);
        z.rig.group.scale.setScalar(0.4 + 0.6 * t);
        z.pos.y += 0.4 * dt;
        if (t >= 1) z.state = 'pursuing';
        animateDrowned(z.rig, ctx.time + z.phase, 0.3, 'swim', dt);
        continue;
      }
      if (ctx.playerDead) {
        // the run is over — drift in place, procedural to the end
        animateDrowned(z.rig, ctx.time + z.phase, 0.1, 'pause', dt);
        continue;
      }
      if (z.state === 'pausing') {
        if (z.stateT >= Z.pauseSec) {
          z.state = 'pursuing';
          z.pauseCooldown = Z.pauseCooldownSec;
        }
        z.vel.multiplyScalar(Math.max(0, 1 - 2 * dt));
        z.pos.addScaledVector(z.vel, dt);
        animateDrowned(z.rig, ctx.time + z.phase, 0.1, 'pause', dt);
        continue;
      }
      if (z.state === 'attacking') {
        // firm, unhurried reach; the grab lands after the windup if you're
        // still in hand
        this.face(z, ctx.playerPos, dt);
        z.vel.multiplyScalar(Math.max(0, 1 - 3 * dt));
        z.pos.addScaledVector(z.vel, dt);
        resolveCollision(z.pos, Z.radius);
        if (z.stateT >= Z.grabWindupSec) {
          if (distToPlayer <= Z.grabRangeM * 1.4) {
            this.vTmp.copy(ctx.playerPos).sub(z.pos).normalize();
            ctx.onGrab(this.vTmp.clone());
            z.grabCooldown = Z.grabCooldownSec;
          }
          z.state = 'pursuing';
          z.stateT = 0;
        }
        animateDrowned(z.rig, ctx.time + z.phase, 0.4, 'reach', dt);
        continue;
      }

      // ── pursuing ──
      if (distToPlayer <= Z.grabRangeM && z.grabCooldown <= 0) {
        z.state = 'attacking';
        z.stateT = 0;
        continue;
      }
      // workstation pause: drifting past an old post, they sometimes stop —
      // as if remembering a task
      if (z.pauseCooldown <= 0 && distToPlayer > 6) {
        for (const s of this.stations) {
          const d2 = (s[0] - z.pos.x) ** 2 + (s[1] - z.pos.y) ** 2 + (s[2] - z.pos.z) ** 2;
          if (d2 < Z.pauseNearM * Z.pauseNearM) {
            if (Math.random() < Z.pauseChance) {
              z.state = 'pausing';
              z.stateT = 0;
            } else {
              z.pauseCooldown = 8; // rolled "no" — don't re-roll every frame
            }
            break;
          }
        }
        if (z.state === 'pausing') continue;
      }

      // target: straight at the player when the water is clear and close;
      // otherwise the next path waypoint
      const direct = distToPlayer < Z.directChaseM && this.hasLos(z.pos.x, z.pos.y, z.pos.z, ctx.playerPos, Z.directChaseM);
      const region = regionAt(z.pos.x, z.pos.y, z.pos.z);
      const inSqueeze = region?.width === 'squeeze';
      let target: Vec3 = [ctx.playerPos.x, ctx.playerPos.y, ctx.playerPos.z];
      if (!direct) {
        z.repathT -= dt;
        if (z.path.length === 0 || z.repathT <= 0 || z.playerNodeAtPath !== this.playerNodeId) this.repath(z);
        // short lookahead in squeezes: a far target points into the wall of a
        // winding crack and the crawl grinds to nothing (chase spot-checks)
        const t = this.pathTarget(z, inSqueeze ? 1.1 : 2.5);
        if (t) target = t;
      }

      // steering: velocity chases the desired direction; squeezes force slow
      let speed = inSqueeze ? Math.min(z.speed, Z.squeezeSpeed) : z.speed;
      if (headAbove) speed *= Z.landSpeedFactor;
      this.vTmp.set(target[0] - z.pos.x, target[1] - z.pos.y, target[2] - z.pos.z).normalize();
      // wall-slide: near rock, strip the into-wall component of the intent so
      // tight passages steer ALONG the channel instead of grinding at it
      if (sdf(z.pos.x, z.pos.y, z.pos.z) > -(Z.radius + 0.3)) {
        const g: [number, number, number] = [0, 0, 0];
        gradient(z.pos.x, z.pos.y, z.pos.z, g);
        const into = this.vTmp.x * g[0] + this.vTmp.y * g[1] + this.vTmp.z * g[2];
        if (into > 0) {
          this.vTmp.x -= g[0] * into;
          this.vTmp.y -= g[1] * into;
          this.vTmp.z -= g[2] * into;
          if (this.vTmp.lengthSq() > 1e-4) this.vTmp.normalize();
        }
      }
      this.vTmp.multiplyScalar(speed);
      if (headAbove) {
        // hauling out (surface decay §5.1): with rock underfoot it's a
        // grounded crawl — no gravity, slope-following climb (gravity was
        // pinning them at the waterline, 2.7 m short of the shore player);
        // airborne (breaching) they fall like anything else
        const grounded = sdf(z.pos.x, z.pos.y - 0.5, z.pos.z) > -0.3;
        if (grounded) {
          this.vTmp.y = Math.min(this.vTmp.y, 1.4);
        } else {
          this.vTmp.y = Math.min(this.vTmp.y, 0.5);
          z.vel.y -= TUNING.player.gravity * 0.6 * dt;
        }
      }
      z.vel.lerp(this.vTmp, Math.min(1, Z.turnRatePerSec * dt));
      z.pos.addScaledVector(z.vel, dt);
      resolveCollision(z.pos, Z.radius);

      // anti-stuck: no progress → force repath + a sideways nudge
      z.stuckT += dt;
      if (z.stuckT >= Z.stuckRepathSec) {
        if (z.lastPos.distanceTo(z.pos) < 0.5 && !direct) {
          this.repath(z);
          // push off the wall (−gradient points into open water) + a jitter
          const g: [number, number, number] = [0, 0, 0];
          gradient(z.pos.x, z.pos.y, z.pos.z, g);
          z.vel.set(-g[0], -g[1], -g[2]).multiplyScalar(1.2);
          this.vTmp2.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
          z.vel.addScaledVector(this.vTmp2, 0.8);
        }
        z.lastPos.copy(z.pos);
        z.stuckT = 0;
      }

      this.face(z, this.vTmp2.copy(z.pos).add(z.vel), dt);
      const pose: DrownedPose = headAbove ? 'crawl' : 'swim';
      animateDrowned(z.rig, ctx.time + z.phase, Math.min(1, z.vel.length() / 4), pose, dt);
    }
  }

  /** Turn the rig to face a point (heading only; the body group pitches). */
  private face(z: Zombie, at: THREE.Vector3, dt: number): void {
    this.vTmp.copy(at).sub(z.pos);
    if (this.vTmp.lengthSq() < 1e-4) return;
    this.vTmp.normalize();
    this.qTmp.setFromUnitVectors(Z_AXIS, this.vTmp);
    z.rig.group.quaternion.slerp(this.qTmp, Math.min(1, dt * 4));
  }

  private updateCorpse(z: Zombie, index: number, dt: number, time: number): void {
    const Z = TUNING.zombies;
    // go limp and DRIFT — corpses hang in the water briefly (DESIGN §8.1)
    z.vel.multiplyScalar(Math.max(0, 1 - 1.2 * dt));
    sampleCurrent(z.pos.x, z.pos.y, z.pos.z, time, this.current);
    z.pos.addScaledVector(this.current, dt * 0.6);
    z.pos.addScaledVector(z.vel, dt);
    z.pos.y -= 0.12 * dt; // the slow settle
    resolveCollision(z.pos, Z.radius * 0.8);
    z.rig.group.rotateOnAxis(this.vTmp.set(0.3, 0.1, 1).normalize(), 0.25 * dt);
    animateDrowned(z.rig, time + z.phase, 0, 'limp', dt);
    const fadeStart = Z.corpseDriftSec - Z.corpseFadeSec;
    if (z.stateT > fadeStart) {
      if (!z.fading) {
        z.fading = true;
        for (const m of z.rig.mats) m.transparent = true;
      }
      const o = Math.max(0, 1 - (z.stateT - fadeStart) / Z.corpseFadeSec);
      for (const m of z.rig.mats) m.opacity = o;
    }
    if (z.stateT >= Z.corpseDriftSec) this.remove(z, index);
  }

  private remove(z: Zombie, index: number): void {
    this.scene.remove(z.rig.group);
    for (const m of z.rig.mats) m.dispose();
    this.shootables = this.shootables.filter((m) => m.userData.zombie !== z);
    this.zombies.splice(index, 1);
  }

  /** Weapon damage. Returns what happened (caller awards the points). */
  applyDamage(z: Zombie, dmg: number): 'hit' | 'killed' {
    if (z.state === 'dead') return 'hit';
    z.hp -= dmg;
    z.hitFlash = 1;
    z.vel.multiplyScalar(0.35); // the stagger
    if (z.hp <= 0) {
      z.hp = 0;
      z.state = 'dead';
      z.stateT = 0;
      this.recovered++;
      return 'killed';
    }
    return 'hit';
  }

  /** Pierce-capable shot (M6a): up to `maxPierce` zombies along the ray,
   *  nearest first, stopped by rock. One zombie counts once even if the ray
   *  clips several of its parts. */
  raycastPierce(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    range: number,
    maxPierce: number,
  ): { hits: { zombie: Zombie; head: boolean; point: [number, number, number]; dist: number }[]; end: [number, number, number] } {
    let wallT = range;
    let t = 0;
    for (let i = 0; i < 220; i++) {
      const d = sdf(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t);
      if (d >= 0) {
        wallT = t;
        break;
      }
      t += Math.max(0.08, -d * 0.85);
      if (t >= range) break;
    }
    this.ray.set(origin, dir);
    this.ray.far = Math.min(wallT, range);
    for (const z of this.zombies) if (z.state !== 'dead') z.rig.group.updateWorldMatrix(false, true);
    const raw = this.ray.intersectObjects(this.shootables, false);
    const seen = new Set<Zombie>();
    const hits: { zombie: Zombie; head: boolean; point: [number, number, number]; dist: number }[] = [];
    for (const h of raw) {
      const z = h.object.userData.zombie as Zombie | undefined;
      if (!z || z.state === 'dead' || seen.has(z)) continue;
      seen.add(z);
      hits.push({ zombie: z, head: h.object.userData.head === true, point: [h.point.x, h.point.y, h.point.z], dist: h.distance });
      if (hits.length >= maxPierce) break;
    }
    const endT = hits.length >= maxPierce ? hits[hits.length - 1].dist : Math.min(wallT, range);
    return { hits, end: [origin.x + dir.x * endT, origin.y + dir.y * endT, origin.z + dir.z * endT] };
  }

  /** Up to `max` live zombies inside a reach-and-arc sweep (Line Lance stab). */
  meleeTargets(origin: THREE.Vector3, dir: THREE.Vector3, rangeM: number, arcDeg: number, max: number): Zombie[] {
    const cosArc = Math.cos(THREE.MathUtils.degToRad(arcDeg));
    const found: { z: Zombie; d: number }[] = [];
    for (const z of this.zombies) {
      if (z.state === 'dead') continue;
      this.vTmp.copy(z.pos).sub(origin);
      const d = this.vTmp.length() - TUNING.zombies.radius;
      if (d > rangeM) continue;
      if (this.vTmp.normalize().dot(dir) < cosArc) continue;
      found.push({ z, d });
    }
    found.sort((a, b) => a.d - b.d);
    return found.slice(0, max).map((f) => f.z);
  }

  /** Nearest thing along a shot ray: zombie (head?) or rock. */
  raycastShot(origin: THREE.Vector3, dir: THREE.Vector3, range: number): ShotResult {
    // rock first (SDF march) — zombies behind a wall can't be hit
    let wallT = range;
    let t = 0;
    for (let i = 0; i < 220; i++) {
      const d = sdf(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t);
      if (d >= 0) {
        wallT = t;
        break;
      }
      t += Math.max(0.08, -d * 0.85);
      if (t >= range) break;
    }
    this.ray.set(origin, dir);
    this.ray.far = Math.min(wallT, range);
    // shots happen mid-tick, before the render refreshes matrices — sync the
    // rigs first or the raycast tests LAST frame's bodies (verified miss)
    for (const z of this.zombies) if (z.state !== 'dead') z.rig.group.updateWorldMatrix(false, true);
    const hits = this.ray.intersectObjects(this.shootables, false);
    for (const h of hits) {
      const z = h.object.userData.zombie as Zombie | undefined;
      if (!z || z.state === 'dead') continue;
      return { kind: 'zombie', point: [h.point.x, h.point.y, h.point.z], dist: h.distance, zombie: z, head: h.object.userData.head === true };
    }
    if (wallT < range) {
      return { kind: 'wall', dist: wallT, point: [origin.x + dir.x * wallT, origin.y + dir.y * wallT, origin.z + dir.z * wallT] };
    }
    return { kind: 'none', dist: range, point: [origin.x + dir.x * range, origin.y + dir.y * range, origin.z + dir.z * range] };
  }

  /** Nearest live zombie inside the knife's reach-and-arc. */
  meleeTarget(origin: THREE.Vector3, dir: THREE.Vector3): Zombie | null {
    const K = TUNING.weapons.knife;
    const cosArc = Math.cos(THREE.MathUtils.degToRad(K.arcDeg));
    let best: Zombie | null = null;
    let bestD = Infinity;
    for (const z of this.zombies) {
      if (z.state === 'dead') continue;
      this.vTmp.copy(z.pos).sub(origin);
      const d = this.vTmp.length() - TUNING.zombies.radius;
      if (d > K.rangeM || d >= bestD) continue;
      if (this.vTmp.normalize().dot(dir) < cosArc) continue;
      best = z;
      bestD = d;
    }
    return best;
  }

  /** Debug: kill everything (optionally leaving n stragglers for Cave Stirs). */
  killAll(leave = 0): number {
    let killed = 0;
    const alive = this.zombies.filter((z) => z.state !== 'dead');
    for (let i = 0; i < alive.length - leave; i++) {
      this.applyDamage(alive[i], alive[i].hp + 1);
      killed++;
    }
    return killed;
  }
}
