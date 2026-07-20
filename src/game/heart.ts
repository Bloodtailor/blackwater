// The Heart and the Ascent (DESIGN §11, LORE §1 void #1: what it is goes
// unanswered — it is warm, it is heavy, and the site objects to it leaving).
// Grab → global spawning, capped zombie speed, one grade darker, a glow in
// your hands — surface with it and the recovery is complete. Also G13: the
// 1971 photograph at the drill head, inspectable, never explained.

import * as THREE from 'three';
import { NODES } from '../cave/data';
import { sdf } from '../cave/sdf';
import { TUNING } from '../tuning';
import type { InteractSystem } from '../economy/interact';

export class HeartRun {
  held = false;
  ascentActive = false;
  won = false;
  private prop: THREE.Group;
  private pulseMat: THREE.MeshStandardMaterial;
  private propLight: THREE.PointLight;
  private interactPos: [number, number, number];
  /** The carried glow — parented to the camera while held. */
  readonly handLight: THREE.PointLight;
  private handProp: THREE.Group;

  constructor(
    scene: THREE.Scene,
    interact: InteractSystem,
    camera: THREE.PerspectiveCamera,
    private hooks: { onFirstGrab: () => void; toast: (m: string) => void },
  ) {
    const apse = NODES.find((n) => n.tags.includes('heart'));
    const at: [number, number, number] = apse ? [...apse.pos] : [0, -170, 100];
    // it rests low in the apse
    for (let d = 0.3; d < 5; d += 0.2) {
      if (sdf(at[0], at[1] - d, at[2]) >= -0.15) {
        at[1] = at[1] - d + 0.55;
        break;
      }
    }
    this.prop = new THREE.Group();
    this.pulseMat = new THREE.MeshStandardMaterial({
      color: 0x4a1512,
      roughness: 0.35,
      emissive: 0xa8321e,
      emissiveIntensity: 0.5,
      flatShading: true,
    });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), this.pulseMat);
    core.scale.set(0.9, 1.1, 0.85);
    this.prop.add(core);
    for (let i = 0; i < 4; i++) {
      const lobe = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), this.pulseMat);
      lobe.position.set(Math.sin(i * 2.1) * 0.3, Math.cos(i * 1.7) * 0.32, Math.sin(i * 3.2) * 0.25);
      this.prop.add(lobe);
    }
    this.propLight = new THREE.PointLight(0xd8452a, 4, 10, 2);
    this.prop.add(this.propLight);
    this.prop.position.set(...at);
    scene.add(this.prop);

    // the carried version: small, low in the view, plus the real glow
    this.handLight = new THREE.PointLight(0xd8452a, 0, TUNING.ascent.heartLightRadiusM, 2);
    camera.add(this.handLight);
    this.handProp = new THREE.Group();
    const handCore = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 1), this.pulseMat);
    this.handProp.add(handCore);
    this.handProp.position.set(-0.24, -0.22, -0.42);
    this.handProp.visible = false;
    camera.add(this.handProp);

    this.interactPos = [at[0], at[1], at[2]];
    interact.add({
      id: 'heart',
      pos: this.interactPos,
      reachM: 3.0,
      prompt: () => {
        if (this.held || this.won) return null;
        return {
          text: 'TAKE THE HEART',
          holdSec: TUNING.ascent.grabHoldSec,
          enabled: true,
          sub: this.ascentActive ? 'it is still warm' : 'once the item is lifted — ascend',
        };
      },
      execute: () => this.grab(),
    });
  }

  grab(): void {
    if (this.held) return;
    this.held = true;
    this.prop.visible = false;
    this.handProp.visible = true;
    this.handLight.intensity = TUNING.ascent.heartLightIntensity;
    if (!this.ascentActive) {
      this.ascentActive = true;
      this.hooks.onFirstGrab();
    } else {
      this.hooks.toast('THE HEART — AGAIN. ASCEND.');
    }
  }

  /** Second Wind death while carrying: it stays where you died. */
  drop(pos: THREE.Vector3): void {
    if (!this.held) return;
    this.held = false;
    this.handProp.visible = false;
    this.handLight.intensity = 0;
    this.prop.position.copy(pos);
    // settle it onto rock below the drop point
    for (let d = 0; d < 6; d += 0.2) {
      if (sdf(pos.x, pos.y - d, pos.z) >= -0.15) {
        this.prop.position.y = pos.y - d + 0.5;
        break;
      }
    }
    this.prop.visible = true;
    this.interactPos[0] = this.prop.position.x;
    this.interactPos[1] = this.prop.position.y;
    this.interactPos[2] = this.prop.position.z;
    this.hooks.toast('THE HEART STAYS WHERE IT FELL');
  }

  update(_dt: number, time: number): void {
    // the slow pulse — a little quicker once the ascent is on
    const rate = this.ascentActive ? 1.6 : 0.9;
    const pulse = 0.5 + 0.35 * (0.5 + 0.5 * Math.sin(time * rate * Math.PI));
    this.pulseMat.emissiveIntensity = pulse;
    this.propLight.intensity = this.prop.visible ? 3 + pulse * 3 : 0;
    if (this.held) this.handLight.intensity = TUNING.ascent.heartLightIntensity * (0.85 + pulse * 0.3);
  }
}

/** G13 — the 1971 photograph, printed and pinned at the drill head. The
 *  procedural print IS the fallback art (LORE §7); Gemini's version is M8's.
 *  The date is the wrongness. Nothing explains it, here or anywhere. */
export function photographDataUrl(): string {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 480;
  const g = c.getContext('2d')!;
  // aged print: white border, sepia-dark field
  g.fillStyle = '#d8d2c0';
  g.fillRect(0, 0, 640, 480);
  const grad = g.createLinearGradient(0, 30, 0, 420);
  grad.addColorStop(0, '#3a3226');
  grad.addColorStop(1, '#181410');
  g.fillStyle = grad;
  g.fillRect(30, 30, 580, 390);
  // the drill head: a dark scaffold mass
  g.strokeStyle = '#0c0a08';
  g.lineWidth = 6;
  g.strokeRect(240, 90, 160, 240);
  g.beginPath();
  g.moveTo(240, 90);
  g.lineTo(320, 50);
  g.lineTo(400, 90);
  g.stroke();
  g.fillStyle = '#0c0a08';
  g.fillRect(300, 120, 40, 210);
  // the crew: six figures, lamp dots, one stands a half-step apart
  const xs = [120, 165, 205, 445, 490, 545];
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    g.fillStyle = '#0e0c0a';
    g.fillRect(x - 12, 250, 24, 80); // body
    g.beginPath();
    g.arc(x, 238, 12, 0, Math.PI * 2); // helm
    g.fill();
    g.fillStyle = '#c8b878';
    g.beginPath();
    g.arc(x, 244, 2.5, 0, Math.PI * 2); // lamp
    g.fill();
  }
  // grain + scratches
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(${180 + Math.random() * 60}, ${170 + Math.random() * 50}, ${140 + Math.random() * 40}, ${Math.random() * 0.09})`;
    g.fillRect(30 + Math.random() * 580, 30 + Math.random() * 390, 1.4, 1.4);
  }
  g.strokeStyle = 'rgba(220,210,190,0.25)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(90, 30);
  g.lineTo(120, 420);
  g.stroke();
  // the margin, typed; the pencil line below it
  g.fillStyle = '#3a352c';
  g.font = '20px Consolas, monospace';
  g.textAlign = 'center';
  g.fillText('B-DECK — DRILL HEAD — MARCH 1971', 320, 452);
  g.font = 'italic 15px Georgia, serif';
  g.fillStyle = '#5a5344';
  g.fillText('do not file.  —L', 320, 472);
  return c.toDataURL('image/png');
}
