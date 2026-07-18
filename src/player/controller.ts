// The player's body (DESIGN §6.1). Three modes:
//  swim  — 6DOF momentum movement; Space/C are CAMERA-relative up/down (under
//          tilt your controls follow your disorientation — user decision);
//          an ambient wandering current pushes position, never the camera.
//  walk  — on dry land (shore, dry pockets): gravity, horizontal movement.
//  noclip — debug freefly (harness + verification), no collision, no drain.

import * as THREE from 'three';
import { TUNING } from '../tuning';
import { gradient, regionAt, resolveCollision, sdf } from '../cave/sdf';
import { fbm } from '../util/noise';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

export type MoveMode = 'swim' | 'walk' | 'noclip';

export class PlayerController {
  mode: MoveMode = 'swim';
  readonly vel = new THREE.Vector3();
  /** Camera roll in radians (tilt system, M4). Applied after yaw/pitch. */
  roll = 0;
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
  private yaw = 0;
  private pitch = 0;
  private euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private fwd = new THREE.Vector3();
  private right = new THREE.Vector3();
  private camUp = new THREE.Vector3();
  private wish = new THREE.Vector3();
  private current = new THREE.Vector3();
  private grounded = false;
  private time = 0;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    dom: HTMLElement,
  ) {
    dom.addEventListener('click', () => dom.requestPointerLock());
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== dom) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.0022, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
    });
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  look(yawDeg: number, pitchDeg: number): void {
    this.yaw = THREE.MathUtils.degToRad(yawDeg);
    this.pitch = THREE.MathUtils.clamp(THREE.MathUtils.degToRad(pitchDeg), -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
    this.applyLook();
  }

  private applyLook(): void {
    this.euler.set(this.pitch, this.yaw, this.roll);
    this.camera.quaternion.setFromEuler(this.euler);
  }

  /** Is a key currently held? (tilt re-level, line follow — M4 systems.) */
  keyDown(code: string): boolean {
    return this.keys.has(code);
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

  // Ambient current: direction AND strength wander with position and time —
  // transitions smooth but quick (user, 2026-07-18).
  private sampleCurrent(out: THREE.Vector3): void {
    const P = TUNING.player;
    const p = this.camera.position;
    const t = this.time * P.currentTimeFreq;
    const a = fbm(p.x * P.currentFreq + t, p.y * P.currentFreq, p.z * P.currentFreq + t * 0.7, 2) * Math.PI * 2;
    const b = fbm(p.x * P.currentFreq + 7.3, p.y * P.currentFreq + t, p.z * P.currentFreq, 2) * Math.PI * 0.45;
    // no strength floor — real lulls and real surges (user, round 4)
    const mag = P.currentSpeed * 1.1 * Math.abs(fbm(p.x * P.currentFreq + t * 1.3, p.y * P.currentFreq + 13.7, p.z * P.currentFreq, 2));
    out.set(Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b)).multiplyScalar(mag);
  }

  update(dt: number, waterLevel: number | null): void {
    this.time += dt;
    const P = TUNING.player;
    // h: head height above the local water line (negative = submerged;
    // -1 stands in for "no surface anywhere near")
    const h = waterLevel !== null ? this.camera.position.y - waterLevel : -1;
    const headAbove = h > 0;
    const look = 1.6 * dt;
    if (this.keys.has('ArrowLeft')) this.yaw += look;
    if (this.keys.has('ArrowRight')) this.yaw -= look;
    if (this.keys.has('ArrowUp')) this.pitch = Math.min(this.pitch + look, Math.PI / 2 - 0.01);
    if (this.keys.has('ArrowDown')) this.pitch = Math.max(this.pitch - look, -Math.PI / 2 + 0.01);
    this.applyLook();

    this.camera.getWorldDirection(this.fwd);
    // camera-relative right: under tilt, strafe follows the rolled frame just
    // like Space/C do — the disorientation carries into ALL the controls
    this.right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.camUp.copy(WORLD_UP).applyQuaternion(this.camera.quaternion);

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
      // damped in squeezes so peak current can never pin you in a crack
      if (!headAbove) {
        this.sampleCurrent(this.current);
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
