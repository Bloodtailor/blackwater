// Chemlight rendering: cold green glows. Sprites carry the look everywhere;
// a small pool of real PointLights rides the nearest few so they genuinely
// light the rock around them (40 real lights would melt integrated GPUs).

import * as THREE from 'three';
import { TUNING } from '../tuning';
import type { Chemlights } from './chemlights';
import { softDotTexture } from '../effects/atmosphere';

export class ChemlightRender {
  private glow: THREE.Points;
  private core: THREE.Points;
  private buf: Float32Array;
  private pool: THREE.PointLight[] = [];

  constructor(scene: THREE.Scene, private chems: Chemlights) {
    const cap = TUNING.chemlights.worldCap;
    this.buf = new Float32Array(cap * 3);
    const mk = (size: number, opacity: number, color: number): THREE.Points => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(this.buf, 3));
      const pts = new THREE.Points(
        geo,
        new THREE.PointsMaterial({
          map: softDotTexture(),
          color,
          size,
          transparent: true,
          opacity,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      pts.frustumCulled = false;
      scene.add(pts);
      return pts;
    };
    this.glow = mk(0.55, 0.5, 0x2fe86a);
    this.core = mk(0.12, 0.95, 0xbaffcf);
    for (let i = 0; i < TUNING.chemlights.lightPool; i++) {
      const l = new THREE.PointLight(0x2fe86a, 0, TUNING.chemlights.lightRadiusM, 2);
      l.visible = false;
      scene.add(l);
      this.pool.push(l);
    }
  }

  update(cam: THREE.Vector3): void {
    const n = this.chems.lights.length;
    for (let i = 0; i < n; i++) {
      const p = this.chems.lights[i].p;
      this.buf[i * 3] = p[0];
      this.buf[i * 3 + 1] = p[1];
      this.buf[i * 3 + 2] = p[2];
    }
    for (const pts of [this.glow, this.core]) {
      pts.geometry.setDrawRange(0, n);
      (pts.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
    // real lights on the nearest few
    const order = this.chems.lights
      .map((c, i) => ({ i, d: (c.p[0] - cam.x) ** 2 + (c.p[1] - cam.y) ** 2 + (c.p[2] - cam.z) ** 2 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, this.pool.length);
    this.pool.forEach((l, k) => {
      const o = order[k];
      if (o) {
        const p = this.chems.lights[o.i].p;
        l.position.set(p[0], p[1], p[2]);
        l.intensity = 3.2;
        l.visible = true;
      } else {
        l.visible = false;
      }
    });
  }
}
