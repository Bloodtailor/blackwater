import { describe, expect, it } from 'vitest';
import { GuideLine, type Vec3 } from './line';
import { TUNING } from '../tuning';

const G = TUNING.guideLine;

/** Swim the hand in a straight line, updating the reel as the player would. */
function swim(gl: GuideLine, from: Vec3, to: Vec3, steps = 200): void {
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    gl.update([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t]);
  }
}

describe('laying (T tap: start anywhere, stop any time, resume at the end)', () => {
  it('starts a line anywhere, pays out ~1 m points, stops, resumes at the end', () => {
    const gl = new GuideLine();
    expect(gl.toggleLaying([0, 0, 0])).toBe('started');
    expect(gl.mode).toBe('laying');
    swim(gl, [0, 0, 0], [20, 0, 0]);
    expect(gl.points.length).toBeGreaterThan(18);
    expect(gl.deployedLengthM).toBeCloseTo(20, 0);
    expect(gl.toggleLaying([20, 0, 0])).toBe('stopped');
    swim(gl, [20, 0, 0], [30, 0, 0]);
    expect(gl.deployedLengthM).toBeCloseTo(20, 0); // stopped: no pay-out
    expect(gl.toggleLaying([25, 0, 0])).toBe('far-from-end'); // can't resume mid-water
    expect(gl.toggleLaying([20.5, 0, 0])).toBe('resumed');
    expect(gl.mode).toBe('laying');
  });

  it('reel meters are conserved between spool and water; a dry reel just ends', () => {
    const gl = new GuideLine();
    gl.toggleLaying([0, 0, 0]);
    swim(gl, [0, 0, 0], [35, 0, 0]);
    expect(gl.reelM + gl.deployedLengthM).toBeCloseTo(G.reelLengthM, 1);
    const dry = new GuideLine();
    dry.reelM = 5;
    dry.toggleLaying([0, 0, 0]);
    swim(dry, [0, 0, 0], [30, 0, 0]);
    expect(dry.deployedLengthM).toBeLessThanOrEqual(5.01);
  });
});

describe('anchors & tie-offs (instant: auto-anchor on start, X tap mid-lay)', () => {
  it('pin() with no line anchors and starts laying; pin() mid-lay ties off', () => {
    const gl = new GuideLine();
    expect(gl.pin([0, 0, 0])).toBe('anchored');
    expect(gl.mode).toBe('laying');
    expect(gl.tieOffs).toEqual([0]);
    swim(gl, [0, 0, 0], [10, 0, 0]);
    expect(gl.pin([10, 0, 0])).toBe('tied');
    expect(gl.tieOffs.length).toBe(2);
  });
});

describe('reeling in (hold X at the end: glide toward the anchor, collecting)', () => {
  it('winds the line back point by point and stows at the start', () => {
    const gl = new GuideLine();
    gl.toggleLaying([0, 0, 0]);
    swim(gl, [0, 0, 0], [12, 0, 0]);
    expect(gl.beginReel([20, 0, 0])).toBe(false); // must be at the end
    expect(gl.beginReel([12, 0, 0])).toBe(true);
    swim(gl, [12, 0, 0], [6, 0, 0]);
    expect(gl.deployedLengthM).toBeLessThan(9);
    swim(gl, [6, 0, 0], [0, 0, 0]);
    expect(gl.deployed).toBe(false);
    expect(gl.mode).toBe('idle');
    expect(gl.reelM).toBeCloseTo(G.reelLengthM, 0);
  });

  it('reelVelocity glides toward the anchor; simulated hold recovers the whole line', () => {
    const gl = new GuideLine();
    gl.toggleLaying([0, 0, 0]);
    swim(gl, [0, 0, 0], [15, 0, 0]);
    gl.toggleLaying([15, 0, 0]); // stop, come back later
    expect(gl.beginReel([15, 0, 0])).toBe(true);
    const v = gl.reelVelocity([15, 0, 0]);
    expect(v).not.toBeNull();
    expect(v![0]).toBeLessThan(-2); // pulled toward the anchor (−x)
    // hold X: integrate the glide, collecting as we go
    const hand: Vec3 = [15, 0, 0];
    const dt = 1 / 60;
    for (let i = 0; i < 60 * 20 && gl.deployed; i++) {
      const rv = gl.reelVelocity(hand);
      if (rv) {
        hand[0] += rv[0] * dt;
        hand[1] += rv[1] * dt;
        hand[2] += rv[2] * dt;
      }
      // the game loop always ticks update(); the final stow happens there
      gl.update(hand);
    }
    expect(gl.deployed).toBe(false); // fully recovered and stowed
    expect(gl.mode).toBe('idle');
    expect(gl.reelM).toBeCloseTo(G.reelLengthM, 0);
  });

  it('releasing X mid-reel leaves the remaining line stopped in place', () => {
    const gl = new GuideLine();
    gl.toggleLaying([0, 0, 0]);
    swim(gl, [0, 0, 0], [10, 0, 0]);
    gl.beginReel([10, 0, 0]);
    swim(gl, [10, 0, 0], [6, 0, 0]); // collect a stretch
    gl.endReel();
    expect(gl.mode).toBe('stopped');
    expect(gl.deployed).toBe(true);
    // winding collects up to reelInRadiusM around the hand, so the new end
    // trails just behind you — and it is grabbable again: resume from it
    const end = gl.points[gl.points.length - 1];
    expect(Math.hypot(end[0] - 6, end[1], end[2])).toBeLessThanOrEqual(G.reelInRadiusM + 1.1);
    expect(gl.toggleLaying(end)).toBe('resumed');
  });

  it('reeling straight out of laying works ("wait, wrong way")', () => {
    const gl = new GuideLine();
    gl.toggleLaying([0, 0, 0]);
    swim(gl, [0, 0, 0], [8, 0, 0]);
    expect(gl.mode).toBe('laying');
    expect(gl.beginReel([8, 0, 0])).toBe(true); // end is at the hand mid-lay
    expect(gl.mode).toBe('reeling');
  });
});

describe('follow mode — latched direction, free look (user 2026-07-19)', () => {
  it('latches direction at engage and keeps it regardless of look', () => {
    const gl = new GuideLine();
    gl.toggleLaying([0, 0, 0]);
    swim(gl, [0, 0, 0], [10, 0, 0]);
    expect(gl.followBegin([5, 1, 0], [1, 0, 0])).toBe(true); // engage facing +x
    const v1 = gl.followVelocity([5, 1, 0]);
    expect(v1![0]).toBeGreaterThan(2); // travels +x
    // now LOOK backward — travel direction must not change
    const v2 = gl.followVelocity([6, 0.5, 0]);
    expect(v2![0]).toBeGreaterThan(2);
    gl.followEnd();
    expect(gl.followVelocity([5, 1, 0])).toBeNull();
    // engage facing the other way → travels -x
    gl.followBegin([5, 1, 0], [-1, 0.2, 0]);
    expect(gl.followVelocity([5, 1, 0])![0]).toBeLessThan(-2);
  });

  it('out of grab range there is nothing to hold', () => {
    const gl = new GuideLine();
    gl.toggleLaying([0, 0, 0]);
    swim(gl, [0, 0, 0], [10, 0, 0]);
    expect(gl.followBegin([5, G.grabRadiusM + 1, 0], [1, 0, 0])).toBe(false);
  });
});
