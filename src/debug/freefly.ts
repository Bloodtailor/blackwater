import * as THREE from 'three';
import { TUNING } from '../tuning';

const UP = new THREE.Vector3(0, 1, 0);

// Noclip camera. Mouselook via pointer lock; arrow keys always work as
// keyboard-look so the harness can drive the camera without pointer lock.
export class Freefly {
  enabled = true;
  // Optional hooks wired by the host: collision resolve + speed modifier.
  resolve?: (pos: THREE.Vector3) => void;
  speedFactor?: () => number;
  private keys = new Set<string>();
  private yaw = 0;
  private pitch = 0;
  private euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private dir = new THREE.Vector3();
  private right = new THREE.Vector3();
  private move = new THREE.Vector3();

  constructor(
    private camera: THREE.PerspectiveCamera,
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

  // Harness: set the view directly (applies immediately, even when rAF is stalled).
  look(yawDeg: number, pitchDeg: number): void {
    this.yaw = THREE.MathUtils.degToRad(yawDeg);
    this.pitch = THREE.MathUtils.clamp(THREE.MathUtils.degToRad(pitchDeg), -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
    this.euler.set(this.pitch, this.yaw, 0);
    this.camera.quaternion.setFromEuler(this.euler);
  }

  update(dt: number): void {
    if (!this.enabled) return;
    const look = 1.6 * dt;
    if (this.keys.has('ArrowLeft')) this.yaw += look;
    if (this.keys.has('ArrowRight')) this.yaw -= look;
    if (this.keys.has('ArrowUp')) this.pitch = Math.min(this.pitch + look, Math.PI / 2 - 0.01);
    if (this.keys.has('ArrowDown')) this.pitch = Math.max(this.pitch - look, -Math.PI / 2 + 0.01);
    this.euler.set(this.pitch, this.yaw, 0);
    this.camera.quaternion.setFromEuler(this.euler);

    const sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const speed = TUNING.player.freeflySpeed * (sprint ? 3 : 1) * (this.speedFactor?.() ?? 1);
    this.camera.getWorldDirection(this.dir);
    this.right.crossVectors(this.dir, UP).normalize();
    this.move.set(0, 0, 0);
    if (this.keys.has('KeyW')) this.move.add(this.dir);
    if (this.keys.has('KeyS')) this.move.sub(this.dir);
    if (this.keys.has('KeyD')) this.move.add(this.right);
    if (this.keys.has('KeyA')) this.move.sub(this.right);
    if (this.keys.has('Space')) this.move.y += 1;
    if (this.keys.has('KeyC')) this.move.y -= 1;
    if (this.move.lengthSq() > 0) {
      this.move.normalize();
      this.camera.position.addScaledVector(this.move, speed * dt);
    }
    this.resolve?.(this.camera.position);
  }
}
