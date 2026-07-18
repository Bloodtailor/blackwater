// Guide line reel (DESIGN §6.6) — the player-authored breadcrumb. Pure logic,
// no three dependency (unit-testable); rendering in lineRender.ts.
//
//  • Q near a tie-off with no line out → ANCHOR here, start paying out.
//  • Swimming pays the line out behind you (a point every ~1 m) until the
//    reel runs dry (or the 400 m deployed cap).
//  • Q near a tie-off mid-lay → pin the line here (tie-off point).
//  • Q near the free end → toggle RE-REEL: walking the line back winds the
//    nearby points onto the reel again; reach the anchor and it's recovered.
//  • Within grabRadius, follow mode (hold T) gives a hand-over-hand glide —
//    lineRender/main turn followVelocity into movement.

import { TUNING } from '../tuning';

export type Vec3 = [number, number, number];

const d3 = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export class GuideLine {
  /** Metres left on the reel (buying a spare adds reelLengthM). */
  reelM: number = TUNING.guideLine.reelLengthM;
  /** Deployed polyline; [0] is the anchor. Empty = stowed. */
  readonly points: Vec3[] = [];
  /** Indices of tie-off pins (render bigger; future systems may anchor here). */
  readonly tieOffs: number[] = [];
  reeling = false;
  /** Bumped whenever geometry changes, so the renderer knows to re-upload. */
  version = 0;
  private deployedM = 0;

  get deployed(): boolean {
    return this.points.length > 0;
  }

  get deployedLengthM(): number {
    return this.deployedM;
  }

  /** Q handler. nearTieOff: within tieOffRadius of a tieOff-tagged node. */
  pressQ(hand: Vec3, nearTieOff: boolean): 'anchored' | 'tied' | 'reeling' | 'stopped-reeling' | null {
    const G = TUNING.guideLine;
    if (!this.deployed) {
      if (!nearTieOff) return null;
      this.points.push([...hand]);
      this.tieOffs.length = 0;
      this.tieOffs.push(0);
      this.deployedM = 0;
      this.reeling = false;
      this.version++;
      return 'anchored';
    }
    const end = this.points[this.points.length - 1];
    const nearEnd = d3(hand, end) <= G.reelInRadiusM;
    const endIsPin = this.tieOffs.includes(this.points.length - 1);
    // Pinning wins over reeling — while laying you are ALWAYS at the free end,
    // so the reel toggle only fires away from tie-off spots (or on a re-press
    // at a spot you already pinned).
    if (nearTieOff && !(nearEnd && endIsPin)) {
      // pin the line here (consumes the short run up to your hand)
      const seg = Math.min(d3(hand, end), this.reelM);
      this.points.push([...hand]);
      this.tieOffs.push(this.points.length - 1);
      this.reelM -= seg;
      this.deployedM += seg;
      this.version++;
      return 'tied';
    }
    if (nearEnd) {
      this.reeling = !this.reeling;
      this.version++;
      return this.reeling ? 'reeling' : 'stopped-reeling';
    }
    return null;
  }

  /** payOut=false while hand-over-handing the line (follow mode) — you don't
   *  lay NEW line along your own line; re-reeling still winds. */
  update(hand: Vec3, payOut = true): void {
    if (!this.deployed) return;
    const G = TUNING.guideLine;
    if (this.reeling) {
      // wind back every point the hand has walked up to
      while (this.points.length > 1 && d3(hand, this.points[this.points.length - 1]) <= G.reelInRadiusM) {
        const end = this.points.pop()!;
        const prev = this.points[this.points.length - 1];
        const seg = d3(end, prev);
        this.deployedM = Math.max(0, this.deployedM - seg);
        this.reelM += seg;
        while (this.tieOffs.length && this.tieOffs[this.tieOffs.length - 1] >= this.points.length) this.tieOffs.pop();
        this.version++;
      }
      if (this.points.length === 1 && d3(hand, this.points[0]) <= G.reelInRadiusM) {
        // recovered the anchor — line stowed
        this.points.length = 0;
        this.tieOffs.length = 0;
        this.reeling = false;
        this.version++;
      }
      return;
    }
    // pay out
    if (!payOut) return;
    const end = this.points[this.points.length - 1];
    const dist = d3(hand, end);
    if (dist < G.pointSpacingM) return;
    if (this.reelM <= 0 || this.deployedM >= G.maxDeployedM) return; // reel dry: the line just ends
    const use = Math.min(dist, this.reelM, G.maxDeployedM - this.deployedM);
    const t = use / dist;
    this.points.push([end[0] + (hand[0] - end[0]) * t, end[1] + (hand[1] - end[1]) * t, end[2] + (hand[2] - end[2]) * t]);
    this.reelM -= use;
    this.deployedM += use;
    this.version++;
  }

  /**
   * Follow mode (§6.6): if `hand` is within grabRadius of the line, returns a
   * velocity gliding along it in the look direction plus a pull onto the line.
   * Works at ANY visibility — that's the point.
   */
  followVelocity(hand: Vec3, look: Vec3): Vec3 | null {
    if (this.points.length < 2) return null;
    const G = TUNING.guideLine;
    let bestD = Infinity;
    let bestPt: Vec3 = [0, 0, 0];
    let bestTan: Vec3 = [0, 0, 1];
    for (let i = 1; i < this.points.length; i++) {
      const a = this.points[i - 1];
      const b = this.points[i];
      const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const len2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
      let t = len2 > 0 ? ((hand[0] - a[0]) * ab[0] + (hand[1] - a[1]) * ab[1] + (hand[2] - a[2]) * ab[2]) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const p: Vec3 = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
      const d = d3(hand, p);
      if (d < bestD) {
        bestD = d;
        bestPt = p;
        const len = Math.sqrt(len2) || 1;
        bestTan = [ab[0] / len, ab[1] / len, ab[2] / len];
      }
    }
    if (bestD > G.grabRadiusM) return null;
    const sign = look[0] * bestTan[0] + look[1] * bestTan[1] + look[2] * bestTan[2] >= 0 ? 1 : -1;
    const pull = Math.min(G.followPullPerSec, G.followPullPerSec * bestD);
    return [
      bestTan[0] * G.followSpeed * sign + (bestPt[0] - hand[0]) * pull,
      bestTan[1] * G.followSpeed * sign + (bestPt[1] - hand[1]) * pull,
      bestTan[2] * G.followSpeed * sign + (bestPt[2] - hand[2]) * pull,
    ];
  }
}
