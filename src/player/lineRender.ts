// Renders the guide line: clean 2008 nylon white (LORE §4 — the crew's rotten
// hemp lines are M8 decor; the contrast is a silent tutorial). A 1 px Line is
// invisible in murk, so vertex dots ride along it; tie-offs get bigger pips.

import * as THREE from 'three';
import type { GuideLine } from './line';
import { softDotTexture } from '../effects/atmosphere';

const MAX_PTS = 512;

export class LineRender {
  private line: THREE.Line;
  private dots: THREE.Points;
  private pins: THREE.Points;
  private posBuf = new Float32Array(MAX_PTS * 3);
  private pinBuf = new Float32Array(32 * 3);
  private lastVersion = -1;

  constructor(scene: THREE.Scene, private gl: GuideLine) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.posBuf, 3));
    this.line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xf4f4ec, transparent: true, opacity: 0.9 }));
    this.line.frustumCulled = false;
    const dotGeo = new THREE.BufferGeometry();
    dotGeo.setAttribute('position', new THREE.BufferAttribute(this.posBuf, 3));
    this.dots = new THREE.Points(
      dotGeo,
      new THREE.PointsMaterial({ map: softDotTexture(), color: 0xf4f4ec, size: 0.06, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    this.dots.frustumCulled = false;
    const pinGeo = new THREE.BufferGeometry();
    pinGeo.setAttribute('position', new THREE.BufferAttribute(this.pinBuf, 3));
    this.pins = new THREE.Points(
      pinGeo,
      new THREE.PointsMaterial({ map: softDotTexture(), color: 0xffe9a8, size: 0.22, transparent: true, opacity: 0.95, depthWrite: false }),
    );
    this.pins.frustumCulled = false;
    scene.add(this.line, this.dots, this.pins);
  }

  update(): void {
    if (this.gl.version === this.lastVersion) return;
    this.lastVersion = this.gl.version;
    const n = Math.min(this.gl.points.length, MAX_PTS);
    for (let i = 0; i < n; i++) {
      this.posBuf[i * 3] = this.gl.points[i][0];
      this.posBuf[i * 3 + 1] = this.gl.points[i][1];
      this.posBuf[i * 3 + 2] = this.gl.points[i][2];
    }
    this.line.geometry.setDrawRange(0, n);
    this.dots.geometry.setDrawRange(0, n);
    (this.line.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.dots.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    const pn = Math.min(this.gl.tieOffs.length, 32);
    for (let i = 0; i < pn; i++) {
      const p = this.gl.points[this.gl.tieOffs[i]];
      if (!p) continue;
      this.pinBuf[i * 3] = p[0];
      this.pinBuf[i * 3 + 1] = p[1];
      this.pinBuf[i * 3 + 2] = p[2];
    }
    this.pins.geometry.setDrawRange(0, pn);
    (this.pins.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}
