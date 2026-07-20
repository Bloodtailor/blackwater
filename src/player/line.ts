// Guide line reel (DESIGN §6.6; strand rework 2026-07-19 round 13 — the
// user: ties must DO something, lines must fork, reeling must never skip).
//
// The line is a NETWORK of strands (independent polylines). Two keys:
//
//  • T tap — context: laying → stop (a strand that never left the hand is
//    discarded) · near a strand's END → resume it · near a strand's MIDDLE
//    → FORK a new strand tied on at that point · open water → start a new
//    strand (auto-anchored to rock when main finds a wall in reach).
//  • T hold — ride the nearest strand (follow): latches strand + direction
//    on engage; at a junction, release and re-grab to switch branches.
//  • X tap — laying: instant tie-off pin · otherwise: CUT the nearest tie.
//  • X hold near an end — reel that strand: glide toward its anchor
//    collecting points. Reeling walks the strand FROM ITS END (never
//    "nearest segment" — jumbled line used to fool it into riding), and a
//    TIE-OFF BLOCKS it: the line is pinned there by design; cut the tie
//    (X tap) to keep collecting. Recovering the anchor stows the strand.
//
// Pure logic, no three dependency (unit-testable); rendering in lineRender.ts.

import { TUNING } from '../tuning';

export type Vec3 = [number, number, number];
export type LineMode = 'idle' | 'laying' | 'stopped' | 'reeling';

export interface LineStrand {
  /** Polyline; [0] is the anchor end. */
  points: Vec3[];
  /** Indices of pinned points (anchors, tie-offs, fork knots). */
  ties: number[];
}

const d3 = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export class GuideLine {
  /** Metres left on the reel (buying a spare adds reelLengthM). */
  reelM: number = TUNING.guideLine.reelLengthM;
  /** All deployed strands. */
  readonly strands: LineStrand[] = [];
  mode: LineMode = 'idle';
  /** Bumped whenever geometry changes, so the renderer knows to re-upload. */
  version = 0;
  private active = -1; // strand being laid or reeled
  private deployedM = 0; // total metres in the water, all strands
  private followDir = 0; // ±1 while following, 0 otherwise
  private followStrand = -1;

  get deployed(): boolean {
    return this.strands.length > 0;
  }

  get deployedLengthM(): number {
    return this.deployedM;
  }

  /** Is any strand's free end within winding reach? */
  nearEnd(hand: Vec3): boolean {
    return this.nearestEndStrand(hand) >= 0;
  }

  private nearestEndStrand(hand: Vec3): number {
    let best = -1;
    let bestD: number = TUNING.guideLine.reelInRadiusM;
    this.strands.forEach((s, i) => {
      const d = d3(hand, s.points[s.points.length - 1]);
      if (d <= bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  private nearestOnStrand(si: number, hand: Vec3): { d: number; pt: Vec3; tan: Vec3 } | null {
    const pts = this.strands[si]?.points;
    if (!pts || pts.length < 2) return null;
    let bestD = Infinity;
    let bestPt: Vec3 = [0, 0, 0];
    let bestTan: Vec3 = [0, 0, 1];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
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
    return { d: bestD, pt: bestPt, tan: bestTan };
  }

  private nearestStrand(hand: Vec3): { si: number; d: number; pt: Vec3; tan: Vec3 } | null {
    let best: { si: number; d: number; pt: Vec3; tan: Vec3 } | null = null;
    for (let si = 0; si < this.strands.length; si++) {
      const n = this.nearestOnStrand(si, hand);
      if (n && (!best || n.d < best.d)) best = { si, ...n };
    }
    return best;
  }

  /**
   * T tap. Context, in priority order: stop laying/reeling (discarding a
   * strand that never left the hand) → resume at a strand's end → fork a new
   * strand off a strand's middle → start fresh (anchored at wallPoint when
   * the caller found rock in reach, else trailing from the hand).
   */
  toggleLaying(hand: Vec3, wallPoint?: Vec3): 'started' | 'anchored' | 'stopped' | 'discarded' | 'resumed' | 'forked' {
    const G = TUNING.guideLine;
    if (this.mode === 'laying' || this.mode === 'reeling') {
      const s = this.strands[this.active];
      this.mode = 'stopped';
      this.version++;
      if (s && s.points.length < 2) {
        // never left the hand — nothing worth keeping in the water
        this.strands.splice(this.active, 1);
        this.active = -1;
        if (!this.deployed) this.mode = 'idle';
        return 'discarded';
      }
      this.active = -1;
      return 'stopped';
    }
    const endSi = this.nearestEndStrand(hand);
    if (endSi >= 0) {
      this.active = endSi;
      this.mode = 'laying';
      this.version++;
      return 'resumed';
    }
    const near = this.nearestStrand(hand);
    if (near && near.d <= G.grabRadiusM) {
      // fork: a new strand tied onto the existing line at the nearest point
      this.strands.push({ points: [[...near.pt]], ties: [0] });
      this.active = this.strands.length - 1;
      this.mode = 'laying';
      this.version++;
      return 'forked';
    }
    this.strands.push(wallPoint ? { points: [[...wallPoint]], ties: [0] } : { points: [[...hand]], ties: [] });
    this.active = this.strands.length - 1;
    this.mode = 'laying';
    this.version++;
    return wallPoint ? 'anchored' : 'started';
  }

  /** X tap while laying: instant tie-off pin at the hand. */
  pin(hand: Vec3): boolean {
    if (this.mode !== 'laying' || this.active < 0) return false;
    const s = this.strands[this.active];
    const end = s.points[s.points.length - 1];
    const seg = Math.min(d3(hand, end), this.reelM);
    s.points.push([...hand]);
    s.ties.push(s.points.length - 1);
    this.reelM -= seg;
    this.deployedM += seg;
    this.version++;
    return true;
  }

  /** X tap while not laying: cut the nearest tie-off (not anchor knots — a
   *  strand's [0] tie is recovered by reeling all the way to it). */
  unpin(hand: Vec3): boolean {
    let bestS = -1;
    let bestI = -1;
    let bestD: number = TUNING.guideLine.reelInRadiusM;
    this.strands.forEach((s, si) => {
      for (const ti of s.ties) {
        if (ti === 0) continue;
        const d = d3(hand, s.points[ti]);
        if (d <= bestD) {
          bestD = d;
          bestS = si;
          bestI = ti;
        }
      }
    });
    if (bestS < 0) return false;
    const ties = this.strands[bestS].ties;
    ties.splice(ties.indexOf(bestI), 1);
    this.version++;
    return true;
  }

  /** X held near a strand's end: start winding it back in. */
  beginReel(hand: Vec3): boolean {
    const si = this.nearestEndStrand(hand);
    if (si < 0) return false;
    this.active = si;
    this.followDir = 0;
    this.mode = 'reeling';
    this.version++;
    return true;
  }

  /** X released: leave whatever remains stopped in place. */
  endReel(): void {
    if (this.mode !== 'reeling') return;
    this.active = -1;
    this.mode = this.deployed ? 'stopped' : 'idle';
    this.version++;
  }

  /** Reeling has hit a tie-off: the line is pinned there by design. */
  get reelBlocked(): boolean {
    if (this.mode !== 'reeling' || this.active < 0) return false;
    const s = this.strands[this.active];
    return s.points.length > 1 && s.ties.includes(s.points.length - 1);
  }

  /**
   * Reeling glide: walk the strand FROM ITS END toward the anchor — never a
   * nearest-segment search, which jumbled line could fool into riding a
   * different stretch without collecting (user bug, round 13).
   */
  reelVelocity(hand: Vec3): Vec3 | null {
    if (this.mode !== 'reeling' || this.active < 0) return null;
    const G = TUNING.guideLine;
    const s = this.strands[this.active];
    const last = s.points[s.points.length - 1];
    const dLast = d3(hand, last);
    if (dLast > G.grabRadiusM + G.reelInRadiusM + 1) return null; // lost the end
    if (this.reelBlocked && dLast <= G.reelInRadiusM) return null; // parked at the tie
    // near the end: head for the next point down the strand; else regain the end
    const target = dLast <= G.reelInRadiusM && s.points.length >= 2 ? s.points[s.points.length - 2] : last;
    const d = d3(hand, target);
    if (d < 1e-6) return [0, 0, 0];
    const f = G.followSpeed / d;
    return [(target[0] - hand[0]) * f, (target[1] - hand[1]) * f, (target[2] - hand[2]) * f];
  }

  /** payOut=false while hand-over-handing the line (follow mode) — you don't
   *  lay NEW line along your own line; re-reeling still winds. */
  update(hand: Vec3, payOut = true): void {
    const G = TUNING.guideLine;
    if (this.mode === 'reeling' && this.active >= 0) {
      const s = this.strands[this.active];
      // wind back every point the hand has walked up to — but a TIE pins the
      // line: collection stops there until the tie is cut
      while (s.points.length > 1 && !s.ties.includes(s.points.length - 1) && d3(hand, s.points[s.points.length - 1]) <= G.reelInRadiusM) {
        const end = s.points.pop()!;
        const prev = s.points[s.points.length - 1];
        const seg = d3(end, prev);
        this.deployedM = Math.max(0, this.deployedM - seg);
        this.reelM += seg;
        while (s.ties.length && s.ties[s.ties.length - 1] >= s.points.length) s.ties.pop();
        this.version++;
      }
      if (s.points.length === 1 && d3(hand, s.points[0]) <= G.reelInRadiusM) {
        // recovered the whole strand — stowed
        this.strands.splice(this.active, 1);
        this.active = -1;
        this.followDir = 0;
        this.mode = this.deployed ? 'stopped' : 'idle';
        this.version++;
      }
      return;
    }
    if (this.mode !== 'laying' || this.active < 0 || !payOut) return;
    const s = this.strands[this.active];
    const end = s.points[s.points.length - 1];
    const dist = d3(hand, end);
    if (dist < G.pointSpacingM) return;
    if (this.reelM <= 0 || this.deployedM >= G.maxDeployedM) return; // reel dry: the line just ends
    const use = Math.min(dist, this.reelM, G.maxDeployedM - this.deployedM);
    const t = use / dist;
    s.points.push([end[0] + (hand[0] - end[0]) * t, end[1] + (hand[1] - end[1]) * t, end[2] + (hand[2] - end[2]) * t]);
    this.reelM -= use;
    this.deployedM += use;
    this.version++;
  }

  /** Is a follow direction currently latched? */
  get followingActive(): boolean {
    return this.followDir !== 0;
  }

  /** Engage follow mode: LATCH the strand and the travel direction from the
   *  look direction at this moment — after that, look wherever you want. At
   *  a junction, release and re-grab to switch branches. */
  followBegin(hand: Vec3, look: Vec3): boolean {
    const near = this.nearestStrand(hand);
    if (!near || near.d > TUNING.guideLine.grabRadiusM) return false;
    const dot = look[0] * near.tan[0] + look[1] * near.tan[1] + look[2] * near.tan[2];
    this.followDir = dot >= 0 ? 1 : -1;
    this.followStrand = near.si;
    return true;
  }

  /** Hand-over-hand glide along the latched strand + direction; free look.
   *  Works at ANY visibility — that's the point. */
  followVelocity(hand: Vec3): Vec3 | null {
    if (this.followDir === 0 || this.followStrand < 0) return null;
    const G = TUNING.guideLine;
    const near = this.nearestOnStrand(this.followStrand, hand);
    if (!near || near.d > G.grabRadiusM) return null;
    const pull = Math.min(G.followPullPerSec, G.followPullPerSec * near.d);
    return [
      near.tan[0] * G.followSpeed * this.followDir + (near.pt[0] - hand[0]) * pull,
      near.tan[1] * G.followSpeed * this.followDir + (near.pt[1] - hand[1]) * pull,
      near.tan[2] * G.followSpeed * this.followDir + (near.pt[2] - hand[2]) * pull,
    ];
  }

  followEnd(): void {
    this.followDir = 0;
    this.followStrand = -1;
  }
}
