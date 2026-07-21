// The Drowned: spawning, pursuit, attacks, deaths (DESIGN §8.1, §13).
// Pathing = A* on the authored graph (pathing.ts) + local steering here;
// burrow spawning keeps the site at complement (LORE §1.1). All numbers in
// tuning.ts.

import * as THREE from 'three';
import { TUNING } from '../tuning';
import { EDGES, NODES, type CaveNode } from '../cave/data';
import { gradient, regionAt, resolveCollision, sdf } from '../cave/sdf';
import { sampleCurrent } from '../player/current';
import { GraphPath, nearestNodeId, refToNodeId, type Vec3 } from './pathing';
import { ShiftSystem, roundHp, roundSpeed } from './rounds';
import { animateDrowned, buildDrowned, type DrownedPose, type DrownedRig } from './drowned';
import { Roster, type CrewProfile } from './roster';

export type ZombieState = 'emerging' | 'pursuing' | 'attacking' | 'pausing' | 'dead';

export interface Zombie {
  id: number;
  /** The man (M14.5, DESIGN §8.6): one of each, ever — the population IS the
   *  roster. His slot frees when the body leaves the world (remove). */
  crew: CrewProfile;
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
  /** Vortex Maw: seconds left being dragged toward pullPoint. */
  pulledT: number;
  pullPoint: THREE.Vector3;
  /** This man's own pace (roster speedMult) — the pack strings out. */
  speedScale: number;
  /** This attack's total windup (base + jitter) — hits desync. */
  windupTotal: number;
  /** Cumulative no-progress time → burrow-back recycle. */
  noProgressT: number;
  /** Closest it has ever been to the player (progress metric). */
  bestDist: number;
  prevPathIdx: number;
  /** M14 (DESIGN §9): far bodies WANDER the graph; near = the hunt. */
  mode: 'wander' | 'hunt';
  /** Wander destination node id (null = pick one). */
  wanderTo: string | null;
  /** Time on the current wander leg (arrival/timeout upkeep). */
  wanderT: number;
  /** Hunt mode: time spent beyond deaggro range (drop the hunt after a while). */
  loseT: number;
  /** Countdown to the next minecraft-style despawn roll. */
  despawnT: number;
  /** This frame's far flag (LOD: reduced animation, no separation). */
  far: boolean;
  /** Accumulated time since the last (possibly skipped) animation tick. */
  animT: number;
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

function getNodeSafe(id: string): CaveNode | undefined {
  return NODES.find((n) => n.id === id);
}

export class ZombieManager {
  readonly zombies: Zombie[] = [];
  /** The watch bill (M14.5): who is on watch, who walks how often. */
  readonly roster = new Roster();
  /** Kills this run (Lowe's ledger — the stats screens read it). */
  recovered = 0;
  /** Debug: freeze the minecraft despawn rolls (watch a wanderer forever). */
  despawnEnabled = true;
  /** The Ascent (DESIGN §11): a hard speed ceiling — pursuit, not capture. */
  ascentSpeedCap: number | null = null;
  private nextId = 1;
  private graph: GraphPath;
  private burrows: CaveNode[];
  private stations: Vec3[];
  private shootables: THREE.Mesh[] = [];
  private playerNodeId = 'sink-pool';
  private ray = new THREE.Raycaster();
  private vTmp = new THREE.Vector3();
  private vTmp2 = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private qTmp = new THREE.Quaternion();
  private current = new THREE.Vector3();

  /** Staggered pack emergence (M14): members surface one by one from the
   *  same proven burrow point — separation strings them out, and no invented
   *  placement math can ever put one inside rock or outside the map. */
  private pack: { burrow: string; count: number; t: number } | null = null;
  private wanderGraph: GraphPath;
  private wanderIds: string[];
  /** M16: museum node ids — rooms the Drowned pretend don't exist. */
  private museumIds: Set<string> = new Set();

  constructor(
    private scene: THREE.Scene,
    readonly rounds: ShiftSystem,
    private isEdgeOpen: (e: import('../cave/data').CaveEdge) => boolean,
    private waterLevelAt: (x: number, y: number, z: number) => number | null,
    /** Region falseUp lookup — deceived rooms lie about up for BODIES too
     *  (user bug 2026-07-20: zombies hauling out in a falseUp air room fell
     *  along true down instead of the lie). */
    private falseUpAt: (ref: string) => [number, number, number] | undefined = () => undefined,
  ) {
    // M16 (DESIGN §12.1): museum rooms are OFF the pathing graph entirely —
    // a true safe zone. The Drowned never chase, wander, or spawn into one;
    // only the enemies pretend the room doesn't exist.
    this.museumIds = new Set(NODES.filter((n) => n.museum).map((n) => n.id));
    const museumIds = this.museumIds;
    const openNonMuseum = (e: import('../cave/data').CaveEdge): boolean =>
      isEdgeOpen(e) && !museumIds.has(e.a) && !museumIds.has(e.b);
    this.graph = new GraphPath(openNonMuseum);
    this.burrows = NODES.filter((n) => n.tags.includes('burrow'));
    // old workstations: facility-tagged spots the crew pauses at, as if
    // remembering a task (LORE §4 directive — cheap idle, deeply wrong)
    const stationTags = ['perk', 'wallBuy', 'boxSpot', 'power', 'pap', 'jukebox'] as const;
    this.stations = NODES.filter((n) => stationTags.some((t) => n.tags.includes(t))).map((n) => [...n.pos]);
    // M14 wander graph (DESIGN §9): squeeze-free — they still CHASE through
    // squeezes, they just don't drift into them; wander TARGETS also exclude
    // burrows and leaf dead-ends (no vanishing into cracks, no loitering at
    // false ends the player will never visit)
    this.wanderGraph = new GraphPath((e) => openNonMuseum(e) && e.width !== 'squeeze');
    const degree = new Map<string, number>();
    for (const e of EDGES) {
      degree.set(e.a, (degree.get(e.a) ?? 0) + 1);
      degree.set(e.b, (degree.get(e.b) ?? 0) + 1);
    }
    this.wanderIds = NODES.filter(
      (n) => !n.teaser && n.kind !== 'audio' && !n.museum && !n.tags.includes('burrow') && (degree.get(n.id) ?? 0) >= 2,
    ).map((n) => n.id);
  }

  get aliveCount(): number {
    return this.zombies.filter((z) => z.state !== 'dead').length;
  }

  /** Ascent spawner: any burrow, shift gates ignored, NEAR spawns allowed —
   *  the site empties everything it has at the thief (DESIGN §11). */
  spawnNearPlayer(playerPos: THREE.Vector3, round: number): Zombie | null {
    const burrow = this.pickBurrow(playerPos, 999, TUNING.zombies.minSpawnDistM);
    return burrow ? this.spawnAt(burrow, round) : null;
  }

  /** Spawn one Drowned at a node (burrow spawning + the debug button).
   *  M14.5: the man comes from the crew book — null when the complement is
   *  already on watch (never two of one man; the spawner waits). */
  spawnAt(nodeId: string, round: number, crewName?: string): Zombie | null {
    const crew = crewName ? this.roster.checkoutByName(crewName) : this.roster.checkout();
    if (!crew) return null;
    const n = NODES.find((x) => x.id === nodeId);
    const pos = n ? n.pos : [0, -5, 0];
    const rig = buildDrowned(crew);
    rig.group.position.set(pos[0], pos[1] - 0.4, pos[2]);
    rig.group.scale.setScalar(0.4);
    this.scene.add(rig.group);
    const R = TUNING.roster;
    const z: Zombie = {
      id: this.nextId++,
      crew,
      rig,
      pos: rig.group.position,
      vel: new THREE.Vector3(),
      hp: roundHp(round) * crew.hpMult,
      maxHp: roundHp(round) * crew.hpMult,
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
      pulledT: 0,
      pullPoint: new THREE.Vector3(),
      // his own pace, from the book — the pack strings out AND the same man
      // swims the same way every watch (speedVariance superseded by M14.5)
      speedScale: crew.speedMult * (crew.quirk === 'runner' ? R.runnerSpeedBonus : 1),
      windupTotal: TUNING.zombies.grabWindupSec,
      noProgressT: 0,
      bestDist: Infinity,
      prevPathIdx: -1,
      mode: 'wander', // near the player it aggros on its first tick
      wanderTo: null,
      wanderT: 0,
      loseT: 0,
      despawnT: Math.random() * TUNING.zombies.despawnCheckSec,
      far: false,
      animT: 0,
    };
    this.zombies.push(z);
    for (const m of rig.meshes) {
      m.userData.zombie = z;
      this.shootables.push(m);
    }
    return z;
  }

  /** Pick a burrow for the next spawn (DESIGN §9/§13): active this shift,
   *  ≥12 m from the player, out of sight preferred. M14: MAP-WIDE — the cave
   *  is populated, not summoned; a mild randomization spreads the packs so
   *  the same nearest burrow doesn't produce the whole population. */
  private pickBurrow(playerPos: THREE.Vector3, shift: number, minDistM?: number): string | null {
    const Z = TUNING.zombies;
    // M14 map-wide population: a UNIFORM pick over every valid burrow —
    // any distance bias at all funnels the whole cave through the burrows
    // nearest the player (observed in the DoD run: 16/16 hunters, 0
    // wanderers). Population spawns additionally keep OUT OF AGGRO RANGE:
    // without that floor, despawn-respawn cycles ratchet the whole cave
    // into hunters camped on the player (observed: 23/24). Fresh bodies
    // start as wanderers; pressure arrives by drifting in — the design.
    const floor = minDistM ?? Math.max(Z.minSpawnDistM, Z.aggroLosM + 4);
    const unseen: CaveNode[] = [];
    const seen: CaveNode[] = [];
    let farthest: CaveNode | null = null;
    let farthestD = -1;
    for (const b of this.burrows) {
      const from = b.contents?.burrowActiveFromRound ?? 1;
      if (shift < from) continue;
      const d = Math.hypot(b.pos[0] - playerPos.x, b.pos[1] - playerPos.y, b.pos[2] - playerPos.z);
      if (d > farthestD) {
        farthestD = d;
        farthest = b;
      }
      if (d < floor) continue;
      (this.hasLos(b.pos[0], b.pos[1], b.pos[2], playerPos, 30) ? seen : unseen).push(b);
    }
    const pool = unseen.length > 0 ? unseen : seen;
    const pick = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : farthest;
    return pick?.id ?? null;
  }

  /** Workstation-pause odds for this man (the pauser quirk stops more). */
  private pauseChanceOf(z: Zombie): number {
    const base = TUNING.zombies.pauseChance;
    return z.crew.quirk === 'pauser' ? Math.min(1, base * TUNING.roster.pauserChanceMult) : base;
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

  /** Pick a fresh wander destination and path to it (squeeze-free graph;
   *  targets exclude burrows/leaves — see the constructor set). With doors
   *  closed the graph is heavily PARTITIONED — random cross-cave targets
   *  mostly fail (observed: 0 wanderers with targets), so after a few tries
   *  fall back to a guaranteed one-hop stroll to a random open neighbor. */
  private rewander(z: Zombie): void {
    const from = refToNodeId(regionAt(z.pos.x, z.pos.y, z.pos.z)?.ref ?? nearestNodeId(z.pos.x, z.pos.y, z.pos.z), z.pos.x, z.pos.y, z.pos.z);
    for (let tries = 0; tries < 8; tries++) {
      const to = this.wanderIds[Math.floor(Math.random() * this.wanderIds.length)];
      if (!to || to === from || to === z.wanderTo) continue;
      const path = this.wanderGraph.findPath(from, to);
      if (path && path.length > 1) {
        z.wanderTo = to;
        z.path = this.wanderGraph.expand(path);
        z.pathIdx = 0;
        z.wanderT = 0;
        return;
      }
    }
    // no squeeze-free journey exists from here. The usual reason: freshly
    // emerged at a burrow whose ONLY exit is its crack (observed: 8/9
    // wanderers idle) — the ESCAPE leg may use any open edge (they can
    // physically do squeezes; they just don't loiter in them), still never
    // toward another burrow.
    const hops = EDGES.filter((e) => {
      if (e.a !== from && e.b !== from) return false;
      if (!this.isEdgeOpen(e)) return false;
      const other = getNodeSafe(e.a === from ? e.b : e.a);
      // never stroll into a burrow — or the museum (M16: off their world)
      return !other?.tags.includes('burrow') && !other?.museum;
    });
    if (hops.length > 0) {
      const e = hops[Math.floor(Math.random() * hops.length)];
      const to = e.a === from ? e.b : e.a;
      const path = this.graph.findPath(from, to); // full graph carries the escape
      if (path && path.length > 1) {
        z.wanderTo = to;
        z.path = this.graph.expand(path);
        z.pathIdx = 0;
        z.wanderT = 0;
        return;
      }
    }
    // truly isolated: idle — the despawn roll recycles it elsewhere
    z.wanderTo = null;
    z.path = [];
    z.wanderT = 0;
  }

  /** Strip the into-wall component of this.vTmp near rock (shared by the
   *  hunt and the wander — tight passages steer ALONG the channel). */
  private slideOffWalls(z: Zombie): void {
    const Z = TUNING.zombies;
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
  }

  update(dt: number, ctx: ZombieCtx): void {
    const Z = TUNING.zombies;
    // player's current graph node (shared by every pursuer)
    const ref = regionAt(ctx.playerPos.x, ctx.playerPos.y, ctx.playerPos.z)?.ref;
    if (ref) this.playerNodeId = refToNodeId(ref, ctx.playerPos.x, ctx.playerPos.y, ctx.playerPos.z);

    // ── population spawning (M14): the shift clock owns cap + pacing; we
    // own burrow choice and staggered pack emergence (1..packMax surface one
    // by one from the same proven point — DESIGN §9, paranoia note honored
    // by never inventing new placement math) ──
    if (!ctx.playerDead) {
      if (!this.pack) {
        const n = this.rounds.wantSpawnPack(this.aliveCount);
        if (n > 0) {
          const burrow = this.pickBurrow(ctx.playerPos, this.rounds.round);
          if (burrow) this.pack = { burrow, count: n, t: 0 };
        }
      }
      if (this.pack) {
        this.pack.t -= dt;
        if (this.pack.t <= 0) {
          // roster exhausted (whole complement on watch) = the pack waits below
          if (!this.spawnAt(this.pack.burrow, this.rounds.round)) {
            this.pack = null;
          } else {
            this.pack.count--;
            this.pack.t = TUNING.shifts.emergeStaggerSec;
            if (this.pack.count <= 0) this.pack = null;
          }
        }
      }
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
        if (t >= 1) {
          if (z.crew.quirk === 'lingerer') {
            // the one who stands too long at the burrow mouth (DESIGN §8.6)
            z.state = 'pausing';
            z.stateT = -TUNING.roster.lingerExtraSec;
          } else {
            z.state = 'pursuing';
          }
        }
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
        // firm, unhurried reach; the grab lands after THIS body's windup
        // (base + per-attack jitter — a crowd never hits in unison)
        this.face(z, ctx.playerPos, dt);
        z.vel.multiplyScalar(Math.max(0, 1 - 3 * dt));
        z.pos.addScaledVector(z.vel, dt);
        resolveCollision(z.pos, Z.radius);
        if (z.stateT >= z.windupTotal) {
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

      // Vortex Maw: the drag overrides everything — the room folds into a
      // point, then the crowd untangles itself
      if (z.pulledT > 0) {
        z.pulledT -= dt;
        this.vTmp.copy(z.pullPoint).sub(z.pos);
        const d = this.vTmp.length();
        if (d > 0.4) {
          this.vTmp.normalize().multiplyScalar(Math.min(TUNING.weapons.vortexMaw.vortexPullSpeed, d * 6));
          z.vel.lerp(this.vTmp, Math.min(1, dt * 10));
        } else {
          z.vel.multiplyScalar(Math.max(0, 1 - 6 * dt));
        }
        z.pos.addScaledVector(z.vel, dt);
        resolveCollision(z.pos, Z.radius);
        animateDrowned(z.rig, ctx.time + z.phase, 1, 'limp', dt); // tumbling
        continue;
      }

      // ── mode (M14, DESIGN §9): near = the hunt, far = the wander; the
      // Ascent hunts with everything the site has ──
      const ascent = this.ascentSpeedCap !== null;
      // M16 (DESIGN §12.1): a player inside a museum room does not exist to
      // the site — no aggro, and every hunter loses the scent. The graph
      // exclusion alone is NOT enough: direct chase and the failed-repath
      // fallback both beeline at raw player position (observed: 5/5 hunters
      // inside the Annex at 0.6 m).
      const playerShielded = this.museumIds.has(this.playerNodeId);
      if (playerShielded && z.mode === 'hunt') {
        z.mode = 'wander';
        z.wanderTo = null;
        z.path = [];
        z.loseT = 0;
      }
      if (z.mode === 'wander') {
        if (
          !playerShielded &&
          (ascent ||
            distToPlayer < Z.aggroM ||
            (distToPlayer < Z.aggroLosM && this.hasLos(z.pos.x, z.pos.y, z.pos.z, ctx.playerPos, Z.aggroLosM)))
        ) {
          z.mode = 'hunt';
          z.path = []; // repath at the player immediately
          z.loseT = 0;
          z.noProgressT = 0;
          z.bestDist = Infinity;
        }
      } else if (!ascent && distToPlayer > Z.deaggroM) {
        z.loseT += dt;
        if (z.loseT >= Z.deaggroSec) {
          z.mode = 'wander';
          z.wanderTo = null; // pick a fresh destination
          z.path = [];
          z.loseT = 0;
        }
      } else {
        z.loseT = 0;
      }
      z.far = z.mode === 'wander' && distToPlayer > Z.lodDistM;

      // ── wandering (M14): drift the graph, avoid squeezes/burrows/dead
      // ends, and roll the minecraft despawn far from unseen eyes ──
      if (z.mode === 'wander') {
        z.despawnT -= dt;
        if (z.despawnT <= 0 && this.despawnEnabled) {
          z.despawnT = Z.despawnCheckSec;
          if (
            distToPlayer > Z.despawnMinDistM &&
            !this.hasLos(z.pos.x, z.pos.y, z.pos.z, ctx.playerPos, 60) &&
            Math.random() < Z.despawnChance
          ) {
            this.remove(z, i); // slips below; the population refills elsewhere
            continue;
          }
        }
        z.wanderT += dt;
        const end = z.path[z.path.length - 1];
        const arrived = end && (z.pos.x - end[0]) ** 2 + (z.pos.y - end[1]) ** 2 + (z.pos.z - end[2]) ** 2 < 4;
        if (!z.wanderTo || z.path.length === 0 || arrived || z.wanderT > Z.wanderTargetTimeoutSec) this.rewander(z);
        // workstation pause reads even better on a wanderer (quirks, M14.5:
        // the pauser stops far more; the runner never stops)
        if (z.pauseCooldown <= 0 && z.crew.quirk !== 'runner') {
          for (const s of this.stations) {
            const d2 = (s[0] - z.pos.x) ** 2 + (s[1] - z.pos.y) ** 2 + (s[2] - z.pos.z) ** 2;
            if (d2 < Z.pauseNearM * Z.pauseNearM) {
              if (Math.random() < this.pauseChanceOf(z)) {
                z.state = 'pausing';
                z.stateT = 0;
              } else {
                z.pauseCooldown = 8;
              }
              break;
            }
          }
          if (z.state === 'pausing') continue;
        }
        const wRegion = regionAt(z.pos.x, z.pos.y, z.pos.z);
        const wt = this.pathTarget(z, wRegion?.width === 'squeeze' ? 1.1 : 2.5);
        if (wt) {
          this.vTmp.set(wt[0] - z.pos.x, wt[1] - z.pos.y, wt[2] - z.pos.z).normalize();
          this.slideOffWalls(z);
          let wSpeed = Math.min(z.speed * z.speedScale, Z.speedCap) * Z.wanderSpeedFactor;
          if (wRegion?.width === 'squeeze') wSpeed = Math.min(wSpeed, Z.squeezeSpeed);
          this.vTmp.multiplyScalar(wSpeed);
          z.vel.lerp(this.vTmp, Math.min(1, Z.turnRatePerSec * dt));
        } else {
          z.vel.multiplyScalar(Math.max(0, 1 - dt));
        }
        z.pos.addScaledVector(z.vel, dt);
        resolveCollision(z.pos, Z.radius);
        this.face(z, this.vTmp2.copy(z.pos).add(z.vel), dt);
        // LOD: a far wanderer animates at ~8 Hz — nobody is watching closely
        z.animT += dt;
        if (!z.far || z.animT > 0.12) {
          animateDrowned(z.rig, ctx.time + z.phase, Math.min(1, z.vel.length() / 4), 'swim', z.animT);
          z.animT = 0;
        }
        continue;
      }

      // ── hunting ──
      // only a few may attack at once; the rest crowd in and jostle
      if (distToPlayer <= Z.grabRangeM && z.grabCooldown <= 0) {
        const attackers = this.zombies.filter((x) => x.state === 'attacking').length;
        if (attackers < Z.maxConcurrentAttackers) {
          z.state = 'attacking';
          z.stateT = 0;
          z.windupTotal = Z.grabWindupSec + Math.random() * Z.grabWindupJitterSec;
          continue;
        }
      }
      // workstation pause: drifting past an old post, they sometimes stop —
      // as if remembering a task
      if (z.pauseCooldown <= 0 && distToPlayer > 6 && z.crew.quirk !== 'runner') {
        for (const s of this.stations) {
          const d2 = (s[0] - z.pos.x) ** 2 + (s[1] - z.pos.y) ** 2 + (s[2] - z.pos.z) ** 2;
          if (d2 < Z.pauseNearM * Z.pauseNearM) {
            if (Math.random() < this.pauseChanceOf(z)) {
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

      // steering: velocity chases the desired direction; squeezes force slow.
      // Each body keeps its own pace (speedScale) so the pack strings out —
      // capped at speedCap so the fastest stays outswimmable.
      let speed = inSqueeze ? Math.min(z.speed, Z.squeezeSpeed) : Math.min(z.speed * z.speedScale, Z.speedCap);
      if (this.ascentSpeedCap !== null) speed = Math.min(speed, this.ascentSpeedCap);
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
        // airborne (breaching) they fall like anything else. All of it runs
        // along the REGION's up: falseUp rooms pull bodies along the lie,
        // exactly like the player controller (user bug 2026-07-20).
        const fu = region ? this.falseUpAt(region.ref) : undefined;
        this.up.set(fu?.[0] ?? 0, fu?.[1] ?? 1, fu?.[2] ?? 0).normalize();
        const grounded = sdf(z.pos.x - this.up.x * 0.5, z.pos.y - this.up.y * 0.5, z.pos.z - this.up.z * 0.5) > -0.3;
        // clamp the intent's along-up component (climb rate)
        const intentUp = this.vTmp.dot(this.up);
        const capUp = grounded ? 1.4 : 0.5;
        if (intentUp > capUp) this.vTmp.addScaledVector(this.up, capUp - intentUp);
        if (!grounded) z.vel.addScaledVector(this.up, -TUNING.player.gravity * 0.6 * dt);
      }
      z.vel.lerp(this.vTmp, Math.min(1, Z.turnRatePerSec * dt));
      z.pos.addScaledVector(z.vel, dt);
      resolveCollision(z.pos, Z.radius);

      // anti-stuck: displacement-based repath + wall nudge (the unstick tool)
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
      // recycle: PROGRESS means getting closer to the player or advancing
      // along the path — the nudge jiggle must not count (it defeated the
      // displacement version). A body without progress for too long burrows
      // back down and returns its ticket, so stuck zombies can never starve
      // the spawner (user 2026-07-20).
      if (distToPlayer < z.bestDist - 0.5 || z.pathIdx !== z.prevPathIdx) {
        z.bestDist = Math.min(z.bestDist, distToPlayer);
        z.prevPathIdx = z.pathIdx;
        z.noProgressT = 0;
      } else {
        z.noProgressT += dt;
      }
      if (z.noProgressT >= Z.stuckDespawnSec && distToPlayer > Z.stuckDespawnMinDistM) {
        // the site keeps its complement — the population spawner refills
        this.remove(z, i);
        continue;
      }

      this.face(z, this.vTmp2.copy(z.pos).add(z.vel), dt);
      const pose: DrownedPose = headAbove ? 'crawl' : 'swim';
      animateDrowned(z.rig, ctx.time + z.phase, Math.min(1, z.vel.length() / 4), pose, dt);
    }

    // ── separation: bodies are BODIES (user 2026-07-20 — no stacking into
    // one point). Positional push-apart between live pairs, capped per frame
    // so it reads as shouldering, not popping. O(n²), n ≤ 9. ──
    const Zt = TUNING.zombies;
    // emerging bodies separate too — debug can spawn nine into one crack
    const live = this.zombies.filter((z) => z.state !== 'dead');
    const maxShove = 3.2 * dt; // m this frame
    for (let a = 0; a < live.length; a++) {
      for (let b = a + 1; b < live.length; b++) {
        const za = live[a];
        const zb = live[b];
        if (za.far && zb.far) continue; // LOD (M14): far pairs skip the solve
        this.vTmp.copy(zb.pos).sub(za.pos);
        let d = this.vTmp.length();
        if (d >= Zt.separationRadiusM) continue;
        if (d < 1e-3) {
          // perfectly stacked: split along a random horizontal
          this.vTmp.set(Math.random() - 0.5, 0.1, Math.random() - 0.5);
          d = this.vTmp.length();
        }
        this.vTmp.normalize();
        const push = Math.min(((Zt.separationRadiusM - d) / 2) * Zt.separationPush * dt, maxShove);
        za.pos.addScaledVector(this.vTmp, -push);
        zb.pos.addScaledVector(this.vTmp, push);
        resolveCollision(za.pos, Zt.radius);
        resolveCollision(zb.pos, Zt.radius);
      }
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
    // the man goes below — his slot on the watch bill frees (a killed man
    // returns only when his body leaves the water: one of each, always)
    this.roster.return(z.crew.name);
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

  /** Melee knockback (user 2026-07-20): shove the body away, break any
   *  attack in progress. */
  knockback(z: Zombie, fromDir: THREE.Vector3, strength: number): void {
    if (z.state === 'dead') return;
    z.vel.addScaledVector(fromDir, strength);
    if (z.state === 'attacking') {
      z.state = 'pursuing';
      z.stateT = 0;
      z.grabCooldown = Math.max(z.grabCooldown, 0.7); // staggered, re-approaches
    }
  }

  /** Vortex Maw impact: drag every live body near the point toward it. */
  vortexPull(point: [number, number, number], radiusM: number, pullSec: number): number {
    let caught = 0;
    for (const z of this.zombies) {
      if (z.state === 'dead') continue;
      const d = Math.hypot(z.pos.x - point[0], z.pos.y - point[1], z.pos.z - point[2]);
      if (d > radiusM) continue;
      z.pullPoint.set(point[0], point[1], point[2]);
      z.pulledT = pullSec;
      caught++;
    }
    return caught;
  }

  /** Arc Projector: the nearest live bodies to a struck zombie (the chain). */
  chainFrom(from: Zombie, radiusM: number, count: number): Zombie[] {
    const found: { z: Zombie; d: number }[] = [];
    for (const z of this.zombies) {
      if (z === from || z.state === 'dead') continue;
      const d = z.pos.distanceTo(from.pos);
      if (d <= radiusM) found.push({ z, d });
    }
    found.sort((a, b) => a.d - b.d);
    return found.slice(0, count).map((f) => f.z);
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
