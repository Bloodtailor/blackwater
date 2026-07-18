// Chemlights (DESIGN §6.6): green marker sticks, tossed or placed, persistent
// for the run (world cap, oldest fade). The player's unambiguous "I was here"
// — the game never marks anything for them. Pure sim (sdf only, three-free);
// rendering in chemlightRender.ts.

import { TUNING } from '../tuning';
import { gradient, sdf } from '../cave/sdf';

export interface Chem {
  p: [number, number, number];
  v: [number, number, number];
  resting: boolean;
}

export class Chemlights {
  /** Sticks carried. They're a wall buy (§10.1); debug grants packs. */
  count: number = TUNING.chemlights.startCount;
  readonly lights: Chem[] = [];
  version = 0;

  /** Toss one in `dir` (unit); slower throw = place at your feet. */
  toss(pos: [number, number, number], dir: [number, number, number], speed = TUNING.chemlights.throwSpeed): boolean {
    if (this.count <= 0) return false;
    this.count--;
    this.lights.push({ p: [...pos], v: [dir[0] * speed, dir[1] * speed, dir[2] * speed], resting: false });
    if (this.lights.length > TUNING.chemlights.worldCap) this.lights.shift(); // oldest fades
    this.version++;
    return true;
  }

  update(dt: number): void {
    const C = TUNING.chemlights;
    const g: [number, number, number] = [0, 0, 0];
    for (const c of this.lights) {
      if (c.resting) continue;
      c.v[1] -= C.sinkAccel * dt; // negatively buoyant: settles to the floor
      const drag = Math.max(0, 1 - C.waterDrag * dt);
      c.v[0] *= drag;
      c.v[1] *= drag;
      c.v[2] *= drag;
      c.p[0] += c.v[0] * dt;
      c.p[1] += c.v[1] * dt;
      c.p[2] += c.v[2] * dt;
      const d = sdf(c.p[0], c.p[1], c.p[2]);
      if (d > -0.12) {
        // touched rock: nudge back inside and rest there
        gradient(c.p[0], c.p[1], c.p[2], g);
        const push = d + 0.12;
        c.p[0] -= g[0] * push;
        c.p[1] -= g[1] * push;
        c.p[2] -= g[2] * push;
        c.v[0] = c.v[1] = c.v[2] = 0;
        c.resting = true;
        this.version++;
      }
    }
  }
}
