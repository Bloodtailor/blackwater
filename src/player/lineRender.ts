// Renders the guide line NETWORK: clean 2008 nylon white (LORE §4 — the
// crew's rotten hemp lines are M8 decor; the contrast is a silent tutorial).
// A 1 px Line is invisible in murk, so vertex dots ride along it; tie-offs
// get bigger pips. Strand rework 2026-07-19: many strands → LineSegments.

import * as THREE from 'three';
import type { GuideLine } from './line';
import { softDotTexture } from '../effects/atmosphere';

const MAX_PTS = 1024;
const MAX_TIES = 64;

export class LineRender {
  private line: THREE.LineSegments;
  private dots: THREE.Points;
  private pins: THREE.Points;
  private segBuf = new Float32Array(MAX_PTS * 2 * 3);
  private dotBuf = new Float32Array(MAX_PTS * 3);
  private pinBuf = new Float32Array(MAX_TIES * 3);
  private lastVersion = -1;

  constructor(scene: THREE.Scene, private gl: GuideLine) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.segBuf, 3));
    this.line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xf4f4ec, transparent: true, opacity: 0.9 }));
    this.line.frustumCulled = false;
    const dotGeo = new THREE.BufferGeometry();
    dotGeo.setAttribute('position', new THREE.BufferAttribute(this.dotBuf, 3));
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
    let seg = 0;
    let dot = 0;
    let pin = 0;
    for (const s of this.gl.strands) {
      for (let i = 0; i < s.points.length; i++) {
        const p = s.points[i];
        if (dot < MAX_PTS) {
          this.dotBuf[dot * 3] = p[0];
          this.dotBuf[dot * 3 + 1] = p[1];
          this.dotBuf[dot * 3 + 2] = p[2];
          dot++;
        }
        if (i > 0 && seg < MAX_PTS) {
          const q = s.points[i - 1];
          this.segBuf[seg * 6] = q[0];
          this.segBuf[seg * 6 + 1] = q[1];
          this.segBuf[seg * 6 + 2] = q[2];
          this.segBuf[seg * 6 + 3] = p[0];
          this.segBuf[seg * 6 + 4] = p[1];
          this.segBuf[seg * 6 + 5] = p[2];
          seg++;
        }
      }
      for (const ti of s.ties) {
        const p = s.points[ti];
        if (!p || pin >= MAX_TIES) continue;
        this.pinBuf[pin * 3] = p[0];
        this.pinBuf[pin * 3 + 1] = p[1];
        this.pinBuf[pin * 3 + 2] = p[2];
        pin++;
      }
    }
    this.line.geometry.setDrawRange(0, seg * 2);
    this.dots.geometry.setDrawRange(0, dot);
    this.pins.geometry.setDrawRange(0, pin);
    (this.line.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.dots.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.pins.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}
