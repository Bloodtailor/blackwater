// Tilt — the disorientation system (DESIGN §6.5). Camera ROLL drifts while
// inside tilt-tagged edge regions (thermocline currents, squeeze exits), up to
// a per-zone max; decays slowly outside; X actively re-levels. The honest
// tells (bubbles rise world-up, depth gauge) live elsewhere and never lie.
// Pure logic — no three dependency (unit-testable).

import { TUNING } from '../tuning';
import { EDGES } from '../cave/data';
import { SETTINGS } from '../ui/settings';

// Region ref → max tilt (deg). Edge prims are ref'd `a~b`; junction nodes
// INSIDE a tilt run (≥2 adjacent tilt edges, e.g. throat-mid) inherit it so
// the drift doesn't stutter off passing through them.
export function buildTiltRegions(): Map<string, number> {
  const map = new Map<string, number>();
  const nodeTilt = new Map<string, { count: number; max: number }>();
  for (const e of EDGES) {
    if (!e.tilt) continue;
    map.set(`${e.a}~${e.b}`, e.tilt.maxDeg);
    for (const id of [e.a, e.b]) {
      const t = nodeTilt.get(id) ?? { count: 0, max: 0 };
      t.count++;
      t.max = Math.max(t.max, e.tilt.maxDeg);
      nodeTilt.set(id, t);
    }
  }
  for (const [id, t] of nodeTilt) if (t.count >= 2) map.set(id, t.max);
  return map;
}

export class TiltSystem {
  /** Last output roll in degrees (HUD/debug mirror; the camera owns truth). */
  rollDeg = 0;

  constructor(
    private regions: Map<string, number>,
    private phase: number = Math.random() * 20,
  ) {}

  /** Max drift for a region ref (capped by the accessibility setting), or 0. */
  maxFor(regionRef: string | null): number {
    if (regionRef === null) return 0;
    const zoneMax = this.regions.get(regionRef) ?? 0;
    return Math.min(zoneMax, SETTINGS.maxTiltDeg);
  }

  /**
   * Step the roll. Free-look rework (user 2026-07-18): the camera's MEASURED
   * roll comes in, the new roll comes back, and the controller applies the
   * difference about the view axis — so drift/decay/re-level act on whatever
   * roll the camera actually has, however it was acquired.
   */
  update(dt: number, regionRef: string | null, relevelHeld: boolean, time: number, currentRollDeg: number): number {
    const T = TUNING.tilt;
    const max = this.maxFor(regionRef);
    let roll = currentRollDeg;
    if (relevelHeld) {
      // active re-level always wins — the player's counter-tool
      roll = approachZero(roll, T.relevelDegPerSec * dt);
    } else if (max > 0) {
      // drift in a direction that holds for long stretches, then wanders
      const s = Math.sin(time * T.wanderFreq * Math.PI * 2 + this.phase) + 0.35 * Math.sin(time * 0.73 + this.phase * 2);
      roll += (s >= 0 ? 1 : -1) * T.driftDegPerSec * dt;
    } else {
      // slow natural decay — you carry disorientation out of the zone
      roll = approachZero(roll, T.decayDegPerSec * dt);
    }
    // clamp to the stronger of zone cap / accessibility cap; if the setting
    // shrank mid-run, pull the roll back inside it
    const cap = max > 0 ? max : SETTINGS.maxTiltDeg;
    if (roll > cap) roll = cap;
    if (roll < -cap) roll = -cap;
    this.rollDeg = roll;
    return roll;
  }
}

function approachZero(v: number, step: number): number {
  if (v > step) return v - step;
  if (v < -step) return v + step;
  return 0;
}
