// The E key's other job (M6a): buy prompts. Finds the nearest interactable in
// reach and view, renders its prompt through the HUD, and runs tap (buys) or
// hold (doors, the Pile breaker) actions. While a prompt is live, E belongs
// to it — the controller suppresses E-roll (M4.7 context-sensitivity note).

import type * as THREE from 'three';
import { TUNING } from '../tuning';

export interface Prompt {
  /** Main line, e.g. `SPEARGUN · 500`. */
  text: string;
  /** Action verb shown before it: `E —` or `HOLD E —`. Derived from holdSec. */
  holdSec: number;
  /** False = shown dimmed and E does nothing (can't afford / no power / capped). */
  enabled: boolean;
  /** Optional reason line when disabled, e.g. `NEED 750`. */
  sub?: string;
}

export interface Interactable {
  id: string;
  pos: [number, number, number];
  /** Big fixtures (the crate, the bench) extend the default reach. */
  reachM?: number;
  /** Current prompt, or null to be invisible (e.g. door already open). */
  prompt(): Prompt | null;
  /** Runs when the tap lands / the hold completes. */
  execute(): void;
}

export class InteractSystem {
  readonly list: Interactable[] = [];
  /** The interactable the player is looking at right now (null = none). */
  target: Interactable | null = null;
  targetPrompt: Prompt | null = null;
  /** Hold progress 0..1 for the HUD bar. */
  progress = 0;
  private holdT = 0;
  private prevHeld = false;
  private fired = false;

  add(i: Interactable): void {
    this.list.push(i);
  }

  update(dt: number, camPos: THREE.Vector3, camDir: THREE.Vector3, eHeld: boolean): void {
    const I = TUNING.interact;
    const cosCone = Math.cos((I.coneDeg * Math.PI) / 180);
    let best: Interactable | null = null;
    let bestPrompt: Prompt | null = null;
    let bestD = Infinity;
    for (const it of this.list) {
      const dx = it.pos[0] - camPos.x;
      const dy = it.pos[1] - camPos.y;
      const dz = it.pos[2] - camPos.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > (it.reachM ?? I.reachM) || d >= bestD) continue;
      if (d > 0.4 && (dx * camDir.x + dy * camDir.y + dz * camDir.z) / d < cosCone) continue;
      const p = it.prompt();
      if (!p) continue;
      best = it;
      bestPrompt = p;
      bestD = d;
    }
    if (best !== this.target) {
      this.holdT = 0;
      this.fired = false;
    }
    this.target = best;
    this.targetPrompt = bestPrompt;

    const pressed = eHeld && !this.prevHeld;
    this.prevHeld = eHeld;
    if (!best || !bestPrompt || !bestPrompt.enabled) {
      this.holdT = 0;
      this.progress = 0;
      return;
    }
    if (bestPrompt.holdSec <= 0) {
      // tap action — once per press
      this.progress = 0;
      if (pressed && !this.fired) {
        best.execute();
        this.fired = true;
      }
      if (!eHeld) this.fired = false;
      return;
    }
    // hold action
    if (eHeld) {
      this.holdT += dt;
      if (this.holdT >= bestPrompt.holdSec && !this.fired) {
        best.execute();
        this.fired = true;
      }
    } else {
      this.holdT = 0;
      this.fired = false;
    }
    this.progress = Math.min(1, this.holdT / bestPrompt.holdSec);
  }
}
