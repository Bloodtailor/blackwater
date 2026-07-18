// The ambient current — ONE source of truth for water motion, shared by the
// player physics (controller) and every particle system (user 2026-07-18: the
// particles must move with the current's direction and speed — the current is
// now something you can SEE). Strength scales with depth (user: stronger the
// deeper you go). Three-free: works on any {x,y,z}.

import { fbm } from '../util/noise';
import { TUNING } from '../tuning';

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** Depth multiplier: gentle near the surface, mean at the bottom. */
export function currentDepthFactor(y: number): number {
  const P = TUNING.player;
  const t = Math.min(1, Math.max(0, -y / P.currentDepthRangeM));
  return P.currentDepthFactorMin + (P.currentDepthFactorMax - P.currentDepthFactorMin) * t;
}

/** Current velocity at a point — direction AND strength wander with position
 *  and time; transitions smooth but quick. No strength floor: real lulls. */
export function sampleCurrent(x: number, y: number, z: number, time: number, out: Vec3Like): void {
  const P = TUNING.player;
  const t = time * P.currentTimeFreq;
  const a = fbm(x * P.currentFreq + t, y * P.currentFreq, z * P.currentFreq + t * 0.7, 2) * Math.PI * 2;
  const b = fbm(x * P.currentFreq + 7.3, y * P.currentFreq + t, z * P.currentFreq, 2) * Math.PI * 0.45;
  const mag =
    P.currentSpeed *
    1.1 *
    Math.abs(fbm(x * P.currentFreq + t * 1.3, y * P.currentFreq + 13.7, z * P.currentFreq, 2)) *
    currentDepthFactor(y);
  out.x = Math.cos(a) * Math.cos(b) * mag;
  out.y = Math.sin(b) * mag;
  out.z = Math.sin(a) * Math.cos(b) * mag;
}
