// The player's body (DESIGN §6.1). Three modes:
//  swim  — 6DOF momentum movement; Space/C are CAMERA-relative up/down; an
//          ambient wandering current pushes position, never the camera.
//  walk  — on dry land (shore, dry pockets): gravity, horizontal movement.
//  noclip — debug freefly (harness + verification), no collision, no drain.
//
// LOOK MODEL (user 2026-07-18, free-look rework): orientation is a single
// quaternion and the mouse always rotates about the CAMERA'S OWN axes — under
// any tilt, mouse-up moves the view "up" on screen. It feels like the world
// has tilted; the controls never change. Walking re-projects to yaw/pitch
// (pitch clamped) so land movement stays a normal first-person feel.
//
// SQUEEZE CONE (user 2026-07-18): inside a squeeze you cannot turn around —
// the view is held to a cone around the passage direction, mouse speed dying
// exponentially toward the rim (full speed back toward center).

import * as THREE from 'three';
import { TUNING } from '../tuning';
import { gradient, regionAt, resolveCollision, sdf } from '../cave/sdf';
import { buildEdgePolylines, buildSlideRegions } from '../cave/data';
import { sampleCurrent } from './current';

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

export type MoveMode = 'swim' | 'walk' | 'noclip';

export class PlayerController {
  mode: MoveMode = 'swim';
  readonly vel = new THREE.Vector3();
  /** Fired when a lunge triggers (main wires this to the HR spike). */
  onLunge?: () => void;
  private keys = new Set<string>();
  private prevSprint = false;
  private prevSpace = false;
  private lungeCooldown = 0;
  private streamline = 0; // 0..1 built momentum (user streamline system)
  private coyote = 0;
  private prevSubmerged = true;
  private velDir = new THREE.Vector3();
  private grad: [number, number, number] = [0, 0, 0];
  private orient = new THREE.Quaternion();
  private euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private qTmp = new THREE.Quaternion();
  private qTmp2 = new THREE.Quaternion();
  private fwd = new THREE.Vector3();
  private right = new THREE.Vector3();
  private camUp = new THREE.Vector3();
  private vTmp = new THREE.Vector3();
  private vTmp2 = new THREE.Vector3();
  private wish = new THREE.Vector3();
  private current = new THREE.Vector3();
  private slides = buildSlideRegions();
  private polylines = buildEdgePolylines();
  private squeezeAxis = new THREE.Vector3();
  private squeezeLocked = false;
  private lastRollDeg = 0;
  private grounded = false;
  private time = 0;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    dom: HTMLElement,
  ) {
    dom.addEventListener('click', () => dom.requestPointerLock());
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== dom) return;
      this.rotateLook(-e.movementX * 0.0022, -e.movementY * 0.0022);
    });
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  /** Set absolute yaw/pitch (harness/scripts). Resets roll to level. */
  look(yawDeg: number, pitchDeg: number): void {
    this.euler.set(THREE.MathUtils.degToRad(pitchDeg), THREE.MathUtils.degToRad(yawDeg), 0);
    this.orient.setFromEuler(this.euler);
    this.camera.quaternion.copy(this.orient);
  }

  /** Incremental look about the camera's own axes (mouse, arrows, scripts). */
  rotateLook(dYaw: number, dPitch: number): void {
    if (this.squeezeLocked && this.mode === 'swim') {
      // moving toward the cone rim slows exponentially; toward center is free
      const cone = THREE.MathUtils.degToRad(TUNING.player.squeezeConeDeg);
      this.vTmp.set(0, 0, -1).applyQuaternion(this.orient);
      const before = this.vTmp.angleTo(this.squeezeAxis);
      this.qTmp2.copy(this.orient);
      this.qTmp.setFromAxisAngle(Y_AXIS, dYaw);
      this.qTmp2.multiply(this.qTmp);
      this.qTmp.setFromAxisAngle(X_AXIS, dPitch);
      this.qTmp2.multiply(this.qTmp);
      this.vTmp.set(0, 0, -1).applyQuaternion(this.qTmp2);
      if (this.vTmp.angleTo(this.squeezeAxis) > before) {
        const f = Math.exp(-TUNING.player.squeezeConeTightness * (before / cone) ** 2);
        dYaw *= f;
        dPitch *= f;
      }
    }
    this.qTmp.setFromAxisAngle(Y_AXIS, dYaw);
    this.orient.multiply(this.qTmp);
    this.qTmp.setFromAxisAngle(X_AXIS, dPitch);
    this.orient.multiply(this.qTmp);
    if (this.squeezeLocked && this.mode === 'swim') {
      this.clampIntoCone(THREE.MathUtils.degToRad(TUNING.player.squeezeConeDeg), Infinity);
    }
    this.camera.quaternion.copy(this.orient);
  }

  /** Camera roll relative to level, in degrees (the tilt system's input). */
  get measuredRollDeg(): number {
    this.fwd.set(0, 0, -1).applyQuaternion(this.orient);
    if (Math.abs(this.fwd.y) > 0.995) return this.lastRollDeg; // gimbal pole
    this.vTmp.crossVectors(this.fwd, WORLD_UP).normalize(); // level right
    this.vTmp2.set(1, 0, 0).applyQuaternion(this.orient); // camera right
    const cos = this.vTmp2.dot(this.vTmp);
    const sin = this.vTmp.cross(this.vTmp2).dot(this.fwd); // levelRight × camRight
    this.lastRollDeg = THREE.MathUtils.radToDeg(Math.atan2(sin, cos));
    return this.lastRollDeg;
  }

  /** Roll the view about its own axis by a delta (tilt system applies drift). */
  applyRollDelta(deltaDeg: number): void {
    if (deltaDeg === 0) return;
    this.qTmp.setFromAxisAngle(Z_AXIS, -THREE.MathUtils.degToRad(deltaDeg));
    this.orient.multiply(this.qTmp);
    this.camera.quaternion.copy(this.orient);
  }

  /** Set absolute roll (debug slider / scripts). */
  setRollDeg(deg: number): void {
    this.applyRollDelta(deg - this.measuredRollDeg);
  }

  /** Rotate the view toward the squeeze axis until within `maxRad`, moving at
   *  most `stepRad` this call (Infinity = hard clamp). */
  private clampIntoCone(maxRad: number, stepRad: number): void {
    this.vTmp.set(0, 0, -1).applyQuaternion(this.orient);
    const theta = this.vTmp.angleTo(this.squeezeAxis);
    if (theta <= maxRad) return;
    const move = Math.min(theta - maxRad, stepRad);
    this.vTmp2.crossVectors(this.vTmp, this.squeezeAxis);
    if (this.vTmp2.lengthSq() < 1e-8) this.vTmp2.crossVectors(this.squeezeAxis, Math.abs(this.squeezeAxis.y) < 0.9 ? WORLD_UP : X_AXIS);
    this.qTmp.setFromAxisAngle(this.vTmp2.normalize(), move);
    this.orient.premultiply(this.qTmp);
    this.camera.quaternion.copy(this.orient);
  }

  get sprinting(): boolean {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  get moving(): boolean {
    return this.wish.lengthSq() > 0;
  }

  get inSqueeze(): boolean {
    const p = this.camera.position;
    return regionAt(p.x, p.y, p.z)?.width === 'squeeze';
  }

  /** Built streamline momentum, 0..1 (debug/harness). */
  get momentum(): number {
    return this.streamline;
  }

  /** Is a key currently held? (tilt re-level, line follow — M4 systems.) */
  keyDown(code: string): boolean {
    return this.keys.has(code);
  }

  /** Is this walk-region a wet slide chute? Downhill unit vector if so. */
  private slideDirAt(x: number, y: number, z: number): [number, number, number] | undefined {
    const ref = regionAt(x, y, z)?.ref;
    return ref ? this.slides.get(ref) : undefined;
  }

  /** Track the squeeze view-lock: passage tangent at the player, signed by
   *  travel direction, with sign continuity while inside. */
  private updateSqueezeLock(): void {
    const p = this.camera.position;
    const r = this.mode === 'swim' ? regionAt(p.x, p.y, p.z) : null;
    if (!r || r.width !== 'squeeze') {
      this.squeezeLocked = false;
      return;
    }
    const pts = this.polylines.get(r.ref);
    if (!pts || pts.length < 2) {
      this.squeezeLocked = false;
      return;
    }
    let bestD = Infinity;
    let bi = 0;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay, az] = pts[i - 1];
      const [bx, by, bz] = pts[i];
      const abx = bx - ax, aby = by - ay, abz = bz - az;
      const len2 = abx * abx + aby * aby + abz * abz;
      let t = len2 > 0 ? ((p.x - ax) * abx + (p.y - ay) * aby + (p.z - az) * abz) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const dx = p.x - (ax + abx * t), dy = p.y - (ay + aby * t), dz = p.z - (az + abz * t);
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bestD) {
        bestD = d;
        bi = i;
      }
    }
    this.vTmp.set(pts[bi][0] - pts[bi - 1][0], pts[bi][1] - pts[bi - 1][1], pts[bi][2] - pts[bi - 1][2]).normalize();
    if (this.squeezeLocked) {
      if (this.vTmp.dot(this.squeezeAxis) < 0) this.vTmp.negate(); // continuity
    } else {
      // entering: face-of-travel becomes "forward" for the whole crawl
      const mov = this.vel.lengthSq() > 0.25 ? this.vel : this.fwd;
      if (this.vTmp.dot(mov) < 0) this.vTmp.negate();
    }
    this.squeezeAxis.copy(this.vTmp);
    this.squeezeLocked = true;
  }

  /** Walking is plain first-person: project back to yaw/pitch, clamp pitch. */
  private reprojectWalk(): void {
    const roll = this.measuredRollDeg; // preserved; decays via the tilt system
    this.fwd.set(0, 0, -1).applyQuaternion(this.orient);
    const pitch = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(this.fwd.y, -1, 1)), -1.5, 1.5);
    const yaw = Math.atan2(-this.fwd.x, -this.fwd.z);
    this.euler.set(pitch, yaw, -THREE.MathUtils.degToRad(roll));
    this.orient.setFromEuler(this.euler);
    this.camera.quaternion.copy(this.orient);
  }

  update(dt: number, waterLevel: number | null): void {
    this.time += dt;
    const P = TUNING.player;
    // h: head height above the local water line (negative = submerged;
    // -1 stands in for "no surface anywhere near")
    const h = waterLevel !== null ? this.camera.position.y - waterLevel : -1;
    const headAbove = h > 0;
    const look = 1.6 * dt;
    if (this.keys.has('ArrowLeft')) this.rotateLook(look, 0);
    if (this.keys.has('ArrowRight')) this.rotateLook(-look, 0);
    if (this.keys.has('ArrowUp')) this.rotateLook(0, look);
    if (this.keys.has('ArrowDown')) this.rotateLook(0, -look);
    if (this.mode === 'walk') this.reprojectWalk();
    this.camera.quaternion.copy(this.orient);

    this.camera.getWorldDirection(this.fwd);
    // camera-relative frame: under tilt, strafe and vertical follow the
    // rolled view — the disorientation carries into ALL the controls
    this.right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.camUp.copy(WORLD_UP).applyQuaternion(this.camera.quaternion);

    // squeeze view-lock upkeep + forced-forward pull when entering off-axis
    this.updateSqueezeLock();
    if (this.squeezeLocked && this.mode === 'swim') {
      this.clampIntoCone(
        THREE.MathUtils.degToRad(TUNING.player.squeezeConeDeg),
        THREE.MathUtils.degToRad(TUNING.player.squeezeConePullDegPerSec) * dt,
      );
      this.camera.getWorldDirection(this.fwd);
      this.right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
      this.camUp.copy(WORLD_UP).applyQuaternion(this.camera.quaternion);
    }

    // desired direction
    this.wish.set(0, 0, 0);
    if (this.keys.has('KeyW')) this.wish.add(this.fwd);
    if (this.keys.has('KeyS')) this.wish.sub(this.fwd);
    if (this.keys.has('KeyD')) this.wish.add(this.right);
    if (this.keys.has('KeyA')) this.wish.sub(this.right);

    if (this.mode === 'noclip') {
      if (this.keys.has('Space')) this.wish.y += 1;
      if (this.keys.has('KeyC')) this.wish.y -= 1;
      if (this.wish.lengthSq() > 0) this.wish.normalize();
      const speed = P.freeflySpeed * (this.sprinting ? 3 : 1);
      this.camera.position.addScaledVector(this.wish, speed * dt);
      return;
    }

    // auto mode: walking requires head above water; falling into water swims
    const pos = this.camera.position;
    if (this.mode === 'walk' && !headAbove) this.mode = 'swim';

    this.lungeCooldown = Math.max(0, this.lungeCooldown - dt);
    if (this.mode === 'swim') {
      // CAMERA-relative vertical (the disorientation carries into controls)
      if (this.keys.has('Space')) this.wish.add(this.camUp);
      if (this.keys.has('KeyC')) this.wish.sub(this.camUp);
      if (this.wish.lengthSq() > 0) this.wish.normalize();
      // Lunge on sprint trigger (edge), with cooldown. Bounded boost: a lunge
      // can fully cancel opposing momentum (impulse ≈ top speed) but never
      // pushes you above lungeMaxBoost in its own direction — so from rest
      // it's a moderate kick, against full speed it zeroes you out (user).
      if (this.sprinting && !this.prevSprint && this.lungeCooldown <= 0) {
        const dir = this.wish.lengthSq() > 0 ? this.wish : this.fwd;
        const impulse = P.lungeImpulse * (this.inSqueeze ? P.lungeSqueezeFactor : 1);
        const vAlong = this.vel.dot(dir);
        // opposing momentum: cancel it (stop near zero, don't shoot through);
        // otherwise: boost, but never above lungeMaxBoost
        const targetAlong =
          vAlong < -0.5
            ? Math.min(vAlong + impulse, 0.5)
            : Math.min(vAlong + impulse, Math.max(vAlong, P.lungeMaxBoost));
        this.vel.addScaledVector(dir, targetAlong - vAlong);
        this.lungeCooldown = P.lungeCooldown;
        this.onLunge?.();
      }
      // Streamline (user, 2026-07-18): holding one direction builds speed
      // toward sprintSpeed even without sprint; direction changes dump it;
      // sprint builds it faster and holds it.
      const S = P.streamline;
      const speed = this.vel.length();
      if (this.wish.lengthSq() > 0) {
        let align = 1;
        if (speed > 0.5) {
          this.velDir.copy(this.vel).normalize();
          align = this.velDir.dot(this.wish);
        }
        if (align >= 0.85) {
          this.streamline = Math.min(1, this.streamline + dt * (this.sprinting ? S.sprintBuildPerSec : S.buildPerSec));
        } else if (align < S.breakDot) {
          this.streamline = Math.max(0, this.streamline - dt * S.breakDecayPerSec);
        }
      } else if (!this.sprinting) {
        this.streamline = Math.max(0, this.streamline - dt * S.idleDecayPerSec);
      }
      const targetCap: number = this.inSqueeze
        ? P.squeezeSpeed
        : THREE.MathUtils.lerp(P.swimSpeed, P.sprintSpeed, this.streamline);
      // Heavy force-based swimming: bounded thrust, low drag. Slow to start,
      // hates stopping, redirecting costs real time. Thrust only cuts out
      // once you're properly clear of the water (breach), not while treading.
      const thrust =
        (this.sprinting ? P.sprintThrust : P.swimThrust) *
        (this.inSqueeze ? 0.7 : 1) *
        (h > 0.5 ? P.breachThrustCut : 1);
      if (this.wish.lengthSq() > 0) this.vel.addScaledVector(this.wish, thrust * dt);
      this.vel.multiplyScalar(Math.max(0, 1 - P.waterDrag * dt));
      // cap limits thrust-driven growth only — a coasting body keeps its
      // momentum (drag is the only brake; squeezes still clamp hard)
      const spd = this.vel.length();
      if (spd > targetCap && (this.wish.lengthSq() > 0 || this.inSqueeze)) {
        this.vel.multiplyScalar(Math.max(targetCap / spd, 1 - 1.5 * dt));
      }
      // Surface physics: gravity ramps in as you rise clear of the line, but
      // a buoyancy spring holds your head comfortably out of the water, and
      // damping near the line stops pogo-bobbing.
      if (h > 0) {
        this.vel.y -= P.gravity * Math.min(1, h / 0.8) * dt;
        if (h < P.floatHeight) this.vel.y += (P.floatHeight - h) * P.buoyancy * dt;
        if (h < 0.6) this.vel.y *= Math.max(0, 1 - P.surfaceDamp * dt);
      }
      pos.addScaledVector(this.vel, dt);
      // splash brake: diving back in kills most of the plunge so momentum
      // doesn't carry you to the floor
      const submerged = !(waterLevel !== null && pos.y > waterLevel);
      if (submerged && !this.prevSubmerged && this.vel.y < -2) {
        this.vel.y *= P.splashDampY;
        this.vel.x *= P.splashDampXZ;
        this.vel.z *= P.splashDampXZ;
      }
      this.prevSubmerged = submerged;
      // ambient current pushes position only (never the camera view);
      // damped in squeezes so peak current can never pin you in a crack;
      // shared sampler — the same current the particles ride (current.ts)
      if (!headAbove) {
        sampleCurrent(pos.x, pos.y, pos.z, this.time, this.current);
        pos.addScaledVector(this.current, this.inSqueeze ? dt * 0.3 : dt);
      }
      if (resolveCollision(pos, P.radius)) {
        // wall impact bleeds the velocity component into the wall
        gradient(pos.x, pos.y, pos.z, this.grad);
        const into = this.vel.x * this.grad[0] + this.vel.y * this.grad[1] + this.vel.z * this.grad[2];
        if (into > 0) {
          this.vel.x -= this.grad[0] * into * 0.9;
          this.vel.y -= this.grad[1] * into * 0.9;
          this.vel.z -= this.grad[2] * into * 0.9;
        }
      }
      // surface into walking: head above water and floor close underfoot
      if (headAbove) {
        const probe = { x: pos.x, y: pos.y - P.eyeHeight, z: pos.z };
        if (resolveCollision(probe, P.radius)) {
          this.mode = 'walk';
          this.grounded = true;
          this.streamline = 0;
        }
      }
    } else {
      // wet slide chute (user 2026-07-18): zero traction — gravity hauls you
      // down the shaft, a tiny lateral nudge is all the control you get, and
      // nothing you do climbs back up. One-way by physics, not by flag.
      const slideDir = this.slideDirAt(pos.x, pos.y - P.eyeHeight * 0.5, pos.z);
      if (slideDir) {
        this.wish.y = 0;
        if (this.wish.lengthSq() > 0) this.wish.normalize();
        this.vel.x += this.wish.x * P.slideControl * dt + slideDir[0] * P.slideAccel * dt;
        this.vel.y += slideDir[1] * P.slideAccel * dt;
        this.vel.z += this.wish.z * P.slideControl * dt + slideDir[2] * P.slideAccel * dt;
        const spd = this.vel.length();
        if (spd > P.slideMaxSpeed) this.vel.multiplyScalar(P.slideMaxSpeed / spd);
        pos.addScaledVector(this.vel, dt);
        const body = { x: pos.x, y: pos.y - P.eyeHeight, z: pos.z };
        resolveCollision(body, P.radius);
        pos.set(body.x, body.y + P.eyeHeight, body.z);
        this.grounded = true;
        this.prevSprint = this.sprinting;
        this.prevSpace = this.keys.has('Space');
        return;
      }
      // walk: horizontal wish, gravity, SDF ground with snap (no jitter),
      // snappy jump with coyote time (dolphin dives off the shore)
      this.wish.y = 0;
      if (this.wish.lengthSq() > 0) this.wish.normalize();
      const target = this.wish.multiplyScalar(P.walkSpeed);
      this.vel.x = THREE.MathUtils.lerp(this.vel.x, target.x, Math.min(1, dt / 0.15));
      this.vel.z = THREE.MathUtils.lerp(this.vel.z, target.z, Math.min(1, dt / 0.15));
      this.coyote = this.grounded ? P.coyoteTime : Math.max(0, this.coyote - dt);
      if (this.keys.has('Space') && !this.prevSpace && this.coyote > 0) {
        this.vel.y = P.jumpSpeed;
        this.coyote = 0;
        this.grounded = false;
      }
      if (!this.grounded || this.vel.y > 0) this.vel.y -= P.gravity * dt;
      pos.addScaledVector(this.vel, dt);
      const body = { x: pos.x, y: pos.y - P.eyeHeight, z: pos.z };
      const corrected = resolveCollision(body, P.radius);
      let grounded = corrected && this.vel.y <= 0.05;
      if (!corrected && this.vel.y <= 0) {
        // ground-snap: floor just below the feet? stick, don't micro-fall
        const d = sdf(body.x, body.y, body.z);
        if (d > -(P.radius + 0.3)) {
          body.y -= -d - P.radius;
          grounded = true;
        }
      }
      this.grounded = grounded;
      if (grounded && this.vel.y < 0) this.vel.y = 0;
      pos.set(body.x, body.y + P.eyeHeight, body.z);
      resolveCollision(pos, 0.3); // headroom
    }
    this.prevSprint = this.sprinting;
    this.prevSpace = this.keys.has('Space');
  }
}
