// The player's body (DESIGN §6.1). Three modes:
//  swim  — 6DOF momentum movement; Space/C are CAMERA-relative up/down (under
//          tilt your controls follow your disorientation — user decision);
//          an ambient wandering current pushes position, never the camera.
//  walk  — on dry land (shore, dry pockets): gravity, horizontal movement.
//  noclip — debug freefly (harness + verification), no collision, no drain.

import * as THREE from 'three';
import { TUNING } from '../tuning';
import { regionAt, resolveCollision } from '../cave/sdf';
import { fbm } from '../util/noise';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

export type MoveMode = 'swim' | 'walk' | 'noclip';

export class PlayerController {
  mode: MoveMode = 'swim';
  readonly vel = new THREE.Vector3();
  private keys = new Set<string>();
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
    this.euler.set(this.pitch, this.yaw, 0);
    this.camera.quaternion.setFromEuler(this.euler);
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

  // Ambient current: direction and strength wander with position and time.
  private sampleCurrent(out: THREE.Vector3): void {
    const P = TUNING.player;
    const p = this.camera.position;
    const t = this.time * P.currentTimeFreq;
    const a = fbm(p.x * P.currentFreq + t, p.y * P.currentFreq, p.z * P.currentFreq, 2) * Math.PI * 2;
    const b = fbm(p.x * P.currentFreq + 7.3, p.y * P.currentFreq + t, p.z * P.currentFreq, 2) * Math.PI * 0.4;
    const mag = P.currentSpeed * (0.7 + 0.6 * Math.abs(fbm(p.x * P.currentFreq, p.y * P.currentFreq + 13.7, p.z * P.currentFreq + t, 2)));
    out.set(Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b)).multiplyScalar(mag);
  }

  update(dt: number, headAbove: boolean): void {
    this.time += dt;
    const P = TUNING.player;
    const look = 1.6 * dt;
    if (this.keys.has('ArrowLeft')) this.yaw += look;
    if (this.keys.has('ArrowRight')) this.yaw -= look;
    if (this.keys.has('ArrowUp')) this.pitch = Math.min(this.pitch + look, Math.PI / 2 - 0.01);
    if (this.keys.has('ArrowDown')) this.pitch = Math.max(this.pitch - look, -Math.PI / 2 + 0.01);
    this.applyLook();

    this.camera.getWorldDirection(this.fwd);
    this.right.crossVectors(this.fwd, WORLD_UP).normalize();
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

    if (this.mode === 'swim') {
      // CAMERA-relative vertical (the disorientation carries into controls)
      if (this.keys.has('Space')) this.wish.add(this.camUp);
      if (this.keys.has('KeyC')) this.wish.sub(this.camUp);
      if (this.wish.lengthSq() > 0) this.wish.normalize();
      let target: number = this.sprinting ? P.sprintSpeed : P.swimSpeed;
      if (this.inSqueeze) target = P.squeezeSpeed;
      // momentum: exponential approach + glide
      const k = this.wish.lengthSq() > 0 ? dt / P.accelTime : dt / P.glideTime;
      this.vel.lerp(this.wish.clone().multiplyScalar(target), Math.min(1, k));
      // out of the water you can't hover — gravity pulls you down to land/water
      if (headAbove) this.vel.y -= P.gravity * 0.6 * dt;
      pos.addScaledVector(this.vel, dt);
      // ambient current pushes position only (never the camera view)
      if (!headAbove) {
        this.sampleCurrent(this.current);
        pos.addScaledVector(this.current, dt);
      }
      resolveCollision(pos, P.radius);
      // surface into walking: head above water and floor close underfoot
      if (headAbove) {
        const probe = { x: pos.x, y: pos.y - P.eyeHeight, z: pos.z };
        if (resolveCollision(probe, P.radius)) this.mode = 'walk';
      }
    } else {
      // walk: horizontal wish only, gravity, ground via SDF
      this.wish.y = 0;
      if (this.wish.lengthSq() > 0) this.wish.normalize();
      const target = this.wish.multiplyScalar(P.walkSpeed);
      this.vel.x = THREE.MathUtils.lerp(this.vel.x, target.x, Math.min(1, dt / 0.15));
      this.vel.z = THREE.MathUtils.lerp(this.vel.z, target.z, Math.min(1, dt / 0.15));
      this.vel.y -= P.gravity * dt;
      pos.addScaledVector(this.vel, dt);
      // body point below the eyes stands on the floor
      const body = { x: pos.x, y: pos.y - P.eyeHeight, z: pos.z };
      const before = body.y;
      const corrected = resolveCollision(body, P.radius);
      this.grounded = corrected && body.y > before - 0.001;
      pos.set(body.x, body.y + P.eyeHeight, body.z);
      if (this.grounded && this.vel.y < 0) this.vel.y = 0;
      resolveCollision(pos, 0.3); // headroom
    }
  }
}
