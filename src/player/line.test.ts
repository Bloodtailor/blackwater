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

describe('anchoring & pay-out (§6.6)', () => {
  it('anchors only at a tie-off, then pays out a point every ~1 m', () => {
    const gl = new GuideLine();
    expect(gl.pressQ([0, 0, 0], false)).toBeNull();
    expect(gl.deployed).toBe(false);
    expect(gl.pressQ([0, 0, 0], true)).toBe('anchored');
    swim(gl, [0, 0, 0], [20, 0, 0]);
    expect(gl.points.length).toBeGreaterThan(18);
    expect(gl.deployedLengthM).toBeCloseTo(20, 0);
    expect(gl.reelM).toBeCloseTo(G.reelLengthM - 20, 0);
  });

  it('reel meters are conserved between spool and water', () => {
    const gl = new GuideLine();
    gl.pressQ([0, 0, 0], true);
    swim(gl, [0, 0, 0], [35, 0, 0]);
    expect(gl.reelM + gl.deployedLengthM).toBeCloseTo(G.reelLengthM, 1);
  });

  it('a dry reel stops paying out — the line just ends', () => {
    const gl = new GuideLine();
    gl.reelM = 5;
    gl.pressQ([0, 0, 0], true);
    swim(gl, [0, 0, 0], [30, 0, 0]);
    expect(gl.deployedLengthM).toBeLessThanOrEqual(5.01);
    const count = gl.points.length;
    swim(gl, [30, 0, 0], [60, 0, 0]);
    expect(gl.points.length).toBe(count);
  });

  it('tie-off pins the line mid-lay', () => {
    const gl = new GuideLine();
    gl.pressQ([0, 0, 0], true);
    swim(gl, [0, 0, 0], [10, 0, 0]);
    expect(gl.pressQ([10, 0, 0], true)).toBe('tied');
    expect(gl.tieOffs.length).toBe(2); // anchor + pin
  });
});

describe('re-reeling', () => {
  it('Q near the free end toggles reeling; walking it back recovers the line', () => {
    const gl = new GuideLine();
    gl.pressQ([0, 0, 0], true);
    swim(gl, [0, 0, 0], [12, 0, 0]);
    const out = gl.deployedLengthM;
    expect(gl.pressQ([12, 0, 0], false)).toBe('reeling');
    swim(gl, [12, 0, 0], [6, 0, 0]);
    expect(gl.deployedLengthM).toBeLessThan(out - 3);
    expect(gl.reelM).toBeGreaterThan(G.reelLengthM - 8);
    swim(gl, [6, 0, 0], [0, 0, 0]);
    expect(gl.deployed).toBe(false); // fully recovered and stowed
    expect(gl.reelM).toBeCloseTo(G.reelLengthM, 0);
  });

  it('Q far from the end (not at a tie-off) does nothing', () => {
    const gl = new GuideLine();
    gl.pressQ([0, 0, 0], true);
    swim(gl, [0, 0, 0], [15, 0, 0]);
    expect(gl.pressQ([7, 0, 0], false)).toBeNull();
    expect(gl.reeling).toBe(false);
  });
});

describe('follow mode — works blind', () => {
  it('glides along the line in the look direction and pulls onto it', () => {
    const gl = new GuideLine();
    gl.pressQ([0, 0, 0], true);
    swim(gl, [0, 0, 0], [10, 0, 0]);
    const fwd = gl.followVelocity([5, 1, 0], [1, 0, 0]);
    expect(fwd).not.toBeNull();
    expect(fwd![0]).toBeGreaterThan(2); // along the line toward +x
    expect(fwd![1]).toBeLessThan(0); // pulled down onto it
    const back = gl.followVelocity([5, 1, 0], [-1, 0, 0]);
    expect(back![0]).toBeLessThan(-2); // same line, other hand
  });

  it('out of grab range there is nothing to hold', () => {
    const gl = new GuideLine();
    gl.pressQ([0, 0, 0], true);
    swim(gl, [0, 0, 0], [10, 0, 0]);
    expect(gl.followVelocity([5, G.grabRadiusM + 1, 0], [1, 0, 0])).toBeNull();
  });
});
