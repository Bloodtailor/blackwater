// Guide line reel (DESIGN §6.6; controls rework 2026-07-19 round 12 — the
// user: players use this constantly AND in a panic, so it is two keys that
// never touch the combat set:
//
//  • T tap — lay / stop / resume, by context. Starting auto-anchors to the
//    nearest rock in reach (main finds the wall point and calls pin()); no
//    ceremony, no timer. Stopping auto-leaves the end grabbable.
//  • T hold — ride the line (follow): latches a travel DIRECTION on engage,
//    then glides hand-over-hand at any visibility with free look.
//  • X tap while laying — instant tie-off pin at the hand.
//  • X hold near the end — reel: glide back along the line toward the
//    anchor, collecting points as you pass (reelVelocity + update); release
//    leaves the rest stopped in place; collect the anchor and it stows.
//
// Pure logic, no three dependency (unit-testable); rendering in lineRender.ts.

import { TUNING } from '../tuning';

export type Vec3 = [number, number, number];
export type LineMode = 'idle' | 'laying' | 'stopped' | 'reeling';

const d3 = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export class GuideLine {
  /** Metres left on the reel (buying a spare adds reelLengthM). */
  reelM: number = TUNING.guideLine.reelLengthM;
  /** Deployed polyline; [0] is the start. Empty = stowed. */
  readonly points: Vec3[] = [];
  /** Indices of pinned points (anchors/tie-offs — render bigger). */
  readonly tieOffs: number[] = [];
  mode: LineMode = 'idle';
  /** Bumped whenever geometry changes, so the renderer knows to re-upload. */
  version = 0;
  private deployedM = 0;
  private followDir = 0; // ±1 while following, 0 otherwise

  get deployed(): boolean {
    return this.points.length > 0;
  }

  get deployedLengthM(): number {
    return this.deployedM;
  }

  nearEnd(hand: Vec3): boolean {
    return this.deployed && d3(hand, this.points[this.points.length - 1]) <= TUNING.guideLine.reelInRadiusM;
  }

  /** T tap: toggle laying. Starting needs no anchor and works anywhere
   *  (main prefers pin() at a wall point when rock is in reach). */
  toggleLaying(hand: Vec3): 'started' | 'stopped' | 'resumed' | 'far-from-end' {
    if (this.mode === 'laying' || this.mode === 'reeling') {
      this.mode = 'stopped';
      this.version++;
      return 'stopped';
    }
    if (!this.deployed) {
      this.points.push([...hand]);
      this.tieOffs.length = 0;
      this.deployedM = 0;
      this.mode = 'laying';
      this.version++;
      return 'started';
    }
    if (this.nearEnd(hand)) {
      this.mode = 'laying';
      this.version++;
      return 'resumed';
    }
    return 'far-from-end';
  }

  /** Pin the line here: no line = anchor + start laying; mid-lay = tie-off.
   *  Instant (X tap / auto-anchor) — the 4 s ceremony is gone. */
  pin(hand: Vec3): 'anchored' | 'tied' {
    if (!this.deployed) {
      this.points.push([...hand]);
      this.tieOffs.length = 0;
      this.tieOffs.push(0);
      this.deployedM = 0;
      this.mode = 'laying';
      this.version++;
      return 'anchored';
    }
    const end = this.points[this.points.length - 1];
    const seg = Math.min(d3(hand, end), this.reelM);
    this.points.push([...hand]);
    this.tieOffs.push(this.points.length - 1);
    this.reelM -= seg;
    this.deployedM += seg;
    if (this.mode !== 'laying') this.mode = 'stopped';
    this.version++;
    return 'tied';
  }

  /** X held near the end (works mid-lay too — "wait, wrong way"): start
   *  winding the line back in. */
  beginReel(hand: Vec3): boolean {
    if (!this.deployed || !this.nearEnd(hand)) return false;
    this.followDir = 0;
    this.mode = 'reeling';
    this.version++;
    return true;
  }

  /** X released: leave whatever line remains stopped in place. */
  endReel(): void {
    if (this.mode !== 'reeling') return;
    this.mode = this.deployed ? 'stopped' : 'idle';
    this.version++;
  }

  /** Reeling glide: pulled along the line TOWARD the anchor while update()
   *  collects the points behind you. Same feel as follow, opposite intent. */
  reelVelocity(hand: Vec3): Vec3 | null {
    if (this.mode !== 'reeling' || !this.deployed) return null;
    const G = TUNING.guideLine;
    if (this.points.length < 2) {
      // only the anchor left: home the last stretch so a held X finishes
      // the recovery instead of dying just short of the wall
      const a = this.points[0];
      const d = d3(hand, a);
      if (d > G.grabRadiusM + G.reelInRadiusM) return null;
      const s = G.followSpeed / (d || 1);
      return [(a[0] - hand[0]) * s, (a[1] - hand[1]) * s, (a[2] - hand[2]) * s];
    }
    const near = this.nearestSegment(hand);
    if (near && near.d <= G.grabRadiusM) {
      const pull = Math.min(G.followPullPerSec, G.followPullPerSec * near.d);
      return [
        -near.tan[0] * G.followSpeed + (near.pt[0] - hand[0]) * pull,
        -near.tan[1] * G.followSpeed + (near.pt[1] - hand[1]) * pull,
        -near.tan[2] * G.followSpeed + (near.pt[2] - hand[2]) * pull,
      ];
    }
    // the wind-in radius outruns the grab radius, so the retreating end can
    // slip out of the hand — chase it instead of stalling
    const end = this.points[this.points.length - 1];
    const d = d3(hand, end);
    if (d > G.grabRadiusM + G.reelInRadiusM + 1) return null;
    const s = G.followSpeed / (d || 1);
    return [(end[0] - hand[0]) * s, (end[1] - hand[1]) * s, (end[2] - hand[2]) * s];
  }

  /** payOut=false while hand-over-handing the line (follow mode) — you don't
   *  lay NEW line along your own line; re-reeling still winds. */
  update(hand: Vec3, payOut = true): void {
    if (!this.deployed) return;
    const G = TUNING.guideLine;
    if (this.mode === 'reeling') {
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
        // recovered the whole line — stowed
        this.points.length = 0;
        this.tieOffs.length = 0;
        this.deployedM = 0;
        this.mode = 'idle';
        this.followDir = 0;
        this.version++;
      }
      return;
    }
    if (this.mode !== 'laying' || !payOut) return;
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

  private nearestSegment(hand: Vec3): { d: number; pt: Vec3; tan: Vec3 } | null {
    if (this.points.length < 2) return null;
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
        bestTan = [ab[0] / len, ab[1] / len, ab[2] / len]; // along increasing index
      }
    }
    return { d: bestD, pt: bestPt, tan: bestTan };
  }

  /** Is a follow direction currently latched? */
  get followingActive(): boolean {
    return this.followDir !== 0;
  }

  /** Engage follow mode: LATCH the travel direction from the look direction
   *  at this moment — after that, look wherever you want (user 2026-07-19). */
  followBegin(hand: Vec3, look: Vec3): boolean {
    const near = this.nearestSegment(hand);
    if (!near || near.d > TUNING.guideLine.grabRadiusM) return false;
    const dot = look[0] * near.tan[0] + look[1] * near.tan[1] + look[2] * near.tan[2];
    this.followDir = dot >= 0 ? 1 : -1;
    return true;
  }

  /** Hand-over-hand glide along the latched direction; free look. Works at
   *  ANY visibility — that's the point. */
  followVelocity(hand: Vec3): Vec3 | null {
    if (this.followDir === 0) return null;
    const G = TUNING.guideLine;
    const near = this.nearestSegment(hand);
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
  }
}
