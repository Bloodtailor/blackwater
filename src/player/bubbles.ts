// Exhale bubbles — the honest "which way is up" tell (DESIGN §6.5): they
// always rise WORLD-up, whatever the camera thinks up is. Exhale bursts every
// few seconds from the player while underwater.

import * as THREE from 'three';

const MAX = 240;

export class Bubbles {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private cursor = 0;
  private exhaleTimer = 0;

  constructor() {
    this.pos = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX); // 0 = dead
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    // round soft sprite — untextured points render as SQUARES (they read as
    // floating rectangles at close range; found via M3 screenshots)
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 32;
    const ctx = c.getContext('2d');
    if (ctx) {
      const g = ctx.createRadialGradient(16, 16, 2, 16, 16, 15);
      g.addColorStop(0, 'rgba(230,248,255,0.9)');
      g.addColorStop(0.7, 'rgba(190,230,245,0.35)');
      g.addColorStop(1, 'rgba(190,230,245,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 32, 32);
    }
    const mat = new THREE.PointsMaterial({
      map: new THREE.CanvasTexture(c),
      size: 0.07,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  private spawn(origin: THREE.Vector3, spread: number): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX;
    this.pos[i * 3] = origin.x + (Math.random() - 0.5) * spread;
    this.pos[i * 3 + 1] = origin.y + (Math.random() - 0.5) * spread * 0.4;
    this.pos[i * 3 + 2] = origin.z + (Math.random() - 0.5) * spread;
    this.vel[i * 3] = (Math.random() - 0.5) * 0.15;
    this.vel[i * 3 + 1] = 0.7 + Math.random() * 0.5; // world-up, always
    this.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.15;
    this.life[i] = 2.5 + Math.random() * 2;
  }

  update(dt: number, head: THREE.Vector3, underwater: boolean, time: number, hr = 60): void {
    if (underwater) {
      this.exhaleTimer -= dt;
      if (this.exhaleTimer <= 0) {
        // breathe faster when the heart runs faster
        const base = Math.min(4.2, Math.max(1.1, 3.4 * (60 / hr)));
        this.exhaleTimer = base + Math.random() * 0.5;
        for (let n = 0; n < 10; n++) this.spawn(head, 0.25);
      }
    }
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.pos[i * 3 + 1] = -9999; // hide
        continue;
      }
      // wobble while rising
      this.pos[i * 3] += (this.vel[i * 3] + Math.sin(time * 6 + i) * 0.08) * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += (this.vel[i * 3 + 2] + Math.cos(time * 5.2 + i * 1.7) * 0.08) * dt;
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}
