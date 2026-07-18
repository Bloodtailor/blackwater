// Visual silt cloud. Fog carries the visibility collapse (atmosphere.ts);
// these particles sell the TEXTURE of hanging silt near the player. One
// camera-local cloud whose density tracks the silt thickness of the chamber
// the camera is in — cheap (one Points draw), and it's wherever the player
// looks, which is the only place it matters.

import * as THREE from 'three';
import { TUNING } from '../tuning';
import { softDotTexture } from './atmosphere';

export class SiltParticles {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private drift: Float32Array;
  private mat: THREE.PointsMaterial;
  private density = 0; // smoothed 0..1

  constructor(scene: THREE.Scene) {
    const n = TUNING.atmosphere.siltParticleMax;
    this.pos = new Float32Array(n * 3);
    this.drift = new Float32Array(n * 3);
    const r = TUNING.atmosphere.siltCloudRadiusM;
    for (let i = 0; i < n; i++) {
      this.pos[i * 3] = (Math.random() - 0.5) * 2 * r;
      this.pos[i * 3 + 1] = (Math.random() - 0.5) * 2 * r;
      this.pos[i * 3 + 2] = (Math.random() - 0.5) * 2 * r;
      this.drift[i * 3] = (Math.random() - 0.5) * 0.3;
      this.drift[i * 3 + 1] = (Math.random() - 0.5) * 0.14;
      this.drift[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.PointsMaterial({
      map: softDotTexture(),
      color: 0xb9ac96, // chalk-silt tan
      size: 0.16,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
  }

  /** thickness: 0..1 silt at the camera's chamber (SiltSystem.thicknessAt);
   *  the cloud drifts with the ambient current like everything suspended. */
  update(dt: number, cam: THREE.Vector3, thickness: number, underwater: boolean, current: THREE.Vector3): void {
    this.density += (thickness - this.density) * Math.min(1, dt * 1.5);
    const visible = underwater && this.density > 0.02;
    this.points.visible = visible;
    if (!visible) return;
    const n = TUNING.atmosphere.siltParticleMax;
    const r = TUNING.atmosphere.siltCloudRadiusM;
    const size = r * 2;
    for (let i = 0; i < n; i++) {
      let x = this.pos[i * 3] + (this.drift[i * 3] + current.x * 0.8) * dt;
      let y = this.pos[i * 3 + 1] + (this.drift[i * 3 + 1] + current.y * 0.8) * dt;
      let z = this.pos[i * 3 + 2] + (this.drift[i * 3 + 2] + current.z * 0.8) * dt;
      // wrap around the camera (positions stored camera-relative-ish: world)
      if (x < cam.x - r) x += size;
      else if (x > cam.x + r) x -= size;
      if (y < cam.y - r) y += size;
      else if (y > cam.y + r) y -= size;
      if (z < cam.z - r) z += size;
      else if (z > cam.z + r) z -= size;
      this.pos[i * 3] = x;
      this.pos[i * 3 + 1] = y;
      this.pos[i * 3 + 2] = z;
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    this.mat.opacity = 0.55 * this.density;
    // draw fewer particles when thin (setDrawRange keeps it one buffer)
    this.points.geometry.setDrawRange(0, Math.floor(n * Math.min(1, this.density * 1.4)));
  }
}
