// Silt state (DESIGN §7) — pure logic, no three dependency (unit-testable).
//
// Two layers:
//  • Ambient stir (§7.1): silty-floored chambers cloud up locally when the
//    player swims fast near the floor or sprints; settles over ~20 s.
//  • Silt-out (§7.2): a chalk mound detonation collapses chamber visibility
//    to ~4 m, fades over ~75 s, and the mound RE-ARMS on full clear.
//
// Chamber membership is ellipsoid containment against the authored node data;
// visuals (fog, particles, mound meshes) read this state every frame.

import { TUNING } from '../tuning';
import type { CaveNode } from '../cave/data';

export interface SiltChamber {
  id: string;
  c: [number, number, number];
  rx: number;
  ry: number;
  rz: number;
  silty: boolean; // ambient-stirrable floor
  mound: boolean; // holds a chalk mound
}

export function chambersFromNodes(nodes: CaveNode[]): SiltChamber[] {
  return nodes
    .filter((n) => n.tags.includes('siltyFloor') || n.tags.includes('chalkMound'))
    .map((n) => {
      const s = n.stretch ?? [1, 1, 1];
      // slight pad so tunnel mouths at the chamber edge still count as inside
      return {
        id: n.id,
        c: n.pos,
        rx: n.radius * s[0] * 1.25,
        ry: n.radius * s[1] * 1.25,
        rz: n.radius * s[2] * 1.25,
        silty: n.tags.includes('siltyFloor'),
        mound: n.tags.includes('chalkMound'),
      };
    });
}

export class SiltSystem {
  /** Ambient stir level per silty chamber, 0..1. */
  readonly stir = new Map<string, number>();
  /** Active silt-outs: chamber id → seconds since detonation. */
  readonly siltouts = new Map<string, number>();
  /** Mound armed state per mound chamber. */
  readonly armed = new Map<string, boolean>();

  constructor(readonly chambers: SiltChamber[]) {
    for (const ch of chambers) if (ch.mound) this.armed.set(ch.id, true);
  }

  /** Smallest chamber containing the point, or null. */
  chamberAt(x: number, y: number, z: number): string | null {
    let best: SiltChamber | null = null;
    for (const ch of this.chambers) {
      const dx = (x - ch.c[0]) / ch.rx;
      const dy = (y - ch.c[1]) / ch.ry;
      const dz = (z - ch.c[2]) / ch.rz;
      if (dx * dx + dy * dy + dz * dz <= 1 && (!best || ch.rx * ch.ry * ch.rz < best.rx * best.ry * best.rz)) {
        best = ch;
      }
    }
    return best?.id ?? null;
  }

  /** The player is actively disturbing this silty chamber this frame. */
  disturb(id: string, dt: number): void {
    const ch = this.chambers.find((c) => c.id === id);
    if (!ch?.silty) return;
    this.stir.set(id, Math.min(1, (this.stir.get(id) ?? 0) + dt / TUNING.silt.stirSec));
  }

  /** Detonate the mound in this chamber (touch/shot). False if not armed. */
  detonate(id: string): boolean {
    if (!this.armed.get(id)) return false;
    this.armed.set(id, false);
    this.siltouts.set(id, 0);
    return true;
  }

  /** Debug/drop hook: silt-out any chamber, mound or not, armed or not. */
  forceSiltout(id: string): void {
    if (this.armed.get(id)) this.armed.set(id, false);
    this.siltouts.set(id, 0);
  }

  /** Debug/Clear-Waters: all silt settles instantly; mounds re-arm (§10.7). */
  clearAll(): void {
    this.stir.clear();
    this.siltouts.clear();
    for (const id of this.armed.keys()) this.armed.set(id, true);
  }

  update(dt: number): void {
    const S = TUNING.silt;
    for (const [id, level] of this.stir) {
      const next = level - dt / S.ambientSettleSec;
      if (next <= 0) this.stir.delete(id);
      else this.stir.set(id, next);
    }
    for (const [id, age] of this.siltouts) {
      const next = age + dt;
      if (next >= S.siltoutFadeSec) {
        this.siltouts.delete(id);
        if (this.armed.has(id)) this.armed.set(id, true); // fully cleared → re-arm
      } else {
        this.siltouts.set(id, next);
      }
    }
  }

  /** Is the point inside an active silt-out? (drives beam narrowing) */
  siltoutAt(id: string | null): boolean {
    return id !== null && this.siltouts.has(id);
  }

  /**
   * Effective visibility (m) in a chamber, given the zone's clear visibility.
   * Silt-outs collapse vis and hold it low for most of the fade; ambient stir
   * caps vis between clear and the ambient floor.
   */
  visibilityAt(id: string | null, clearVisM: number): number {
    if (id === null) return clearVisM;
    const S = TUNING.silt;
    let vis = clearVisM;
    const stir = this.stir.get(id);
    if (stir !== undefined) {
      vis = Math.min(vis, clearVisM + (S.ambientVisM - clearVisM) * stir);
    }
    const age = this.siltouts.get(id);
    if (age !== undefined) {
      const t = age / S.siltoutFadeSec;
      vis = Math.min(vis, S.siltoutVisM + (clearVisM - S.siltoutVisM) * t * t);
    }
    return vis;
  }

  /** 0..1 particle thickness at a point (drives the local silt cloud). */
  thicknessAt(id: string | null): number {
    if (id === null) return 0;
    let t = this.stir.get(id) ?? 0;
    const age = this.siltouts.get(id);
    if (age !== undefined) {
      const p = age / TUNING.silt.siltoutFadeSec;
      t = Math.max(t, 1 - p * p);
    }
    return t;
  }
}
