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

/** Hold X: integrate the reel glide, collecting, until stowed or blocked. */
function holdReel(gl: GuideLine, hand: Vec3, seconds = 30): void {
  const dt = 1 / 60;
  for (let i = 0; i < 60 * seconds; i++) {
    const rv = gl.reelVelocity(hand);
    if (rv) {
      hand[0] += rv[0] * dt;
      hand[1] += rv[1] * dt;
      hand[2] += rv[2] * dt;
    }
    gl.update(hand); // the game loop always ticks update()
    if (gl.mode !== 'reeling' || (!rv && gl.reelBlocked)) break;
  }
}

describe('laying (T tap: start anywhere, stop any time, resume at the end)', () => {
  it('starts a strand anywhere, pays out ~1 m points, stops, resumes at the end', () => {
    const gl = new GuideLine();
    expect(gl.toggleLaying([0, 0, 0])).toBe('started');
    expect(gl.mode).toBe('laying');
    swim(gl, [0, 0, 0], [20, 0, 0]);
    expect(gl.strands[0].points.length).toBeGreaterThan(18);
    expect(gl.deployedLengthM).toBeCloseTo(20, 0);
    expect(gl.toggleLaying([20, 0, 0])).toBe('stopped');
    swim(gl, [20, 0, 0], [30, 0, 0]);
    expect(gl.deployedLengthM).toBeCloseTo(20, 0); // stopped: no pay-out
    expect(gl.toggleLaying([20.5, 0, 0])).toBe('resumed');
    expect(gl.mode).toBe('laying');
  });

  it('an anchored start pins the first point; a strand that never left the hand is discarded', () => {
    const gl = new GuideLine();
    expect(gl.toggleLaying([0, 0, 0], [0, -0.5, 0])).toBe('anchored');
    expect(gl.strands[0].ties).toEqual([0]);
    expect(gl.toggleLaying([0, 0, 0])).toBe('discarded');
    expect(gl.deployed).toBe(false);
    expect(gl.mode).toBe('idle');
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

describe('forking (T tap near a strand middle starts a tied-on branch)', () => {
  it('creates a second strand anchored on the first; both count against the reel', () => {
    const gl = new GuideLine();
    gl.toggleLaying([0, 0, 0]);
    swim(gl, [0, 0, 0], [20, 0, 0]);
    gl.toggleLaying([20, 0, 0]); // stop
    // tap T near the middle of the line (not near either end)
    expect(gl.toggleLaying([10, 0.5, 0])).toBe('forked');
    expect(gl.strands.length).toBe(2);
    expect(gl.strands[1].ties).toEqual([0]); // fork knot
    expect(gl.strands[1].points[0][0]).toBeCloseTo(10, 0); // tied on at the line
    swim(gl, [10, 0.5, 0], [10, 0.5, 15]); // lay the branch
    gl.toggleLaying([10, 0.5, 15]);
    expect(gl.deployedLengthM).toBeCloseTo(35, 0);
    expect(gl.reelM + gl.deployedLengthM).toBeCloseTo(G.reelLengthM, 1);
  });

  it('follow latches ONE strand — a junction never silently switches branches', () => {
    const gl = new GuideLine();
    gl.toggleLaying([0, 0, 0]);
    swim(gl, [0, 0, 0], [20, 0, 0]);
    gl.toggleLaying([20, 0, 0]);
    gl.toggleLaying([10, 0, 0]); // fork at the middle
    swim(gl, [10, 0, 0], [10, 0, 15]);
    gl.toggleLaying([10, 0, 15]);
    // engage on the MAIN strand near the junction, heading +x
    expect(gl.followBegin([9, 0.5, 0.4], [1, 0, 0])).toBe(true);
    // even standing right at the junction, velocity follows the main strand
    const v = gl.followVelocity([10, 0.5, 0.4]);
    expect(Math.abs(v![0])).toBeGreaterThan(2); // along the main line (±x)
    expect(Math.abs(v![2])).toBeLessThan(2); // not diverted up the branch (+z)
  });
});

describe('reeling (hold X at an end: walk the strand from its end, collecting)', () => {
  it('recovers a straight strand fully and stows it', () => {
    const gl = new GuideLine();
    gl.toggleLaying([0, 0, 0]);
    swim(gl, [0, 0, 0], [15, 0, 0]);
    gl.toggleLaying([15, 0, 0]);
    expect(gl.beginReel([15, 0, 0])).toBe(true);
    holdReel(gl, [15, 0, 0]);
    expect(gl.deployed).toBe(false);
    expect(gl.mode).toBe('idle');
    expect(gl.reelM).toBeCloseTo(G.reelLengthM, 0);
  });

  it('JUMBLED line: doubling back within grab range must not fool the reel into riding', () => {
    const gl = new GuideLine();
    gl.toggleLaying([0, 0, 0]);
    // out 15 m, then back parallel only 1 m away (inside grabRadius of the
    // first pass) — nearest-segment logic used to jump tracks here
    swim(gl, [0, 0, 0], [15, 0, 0]);
    swim(gl, [15, 0, 0], [15, 0, 1]);
    swim(gl, [15, 0, 1], [0, 0, 1]);
    gl.toggleLaying([0, 0, 1]);
    const total = gl.deployedLengthM;
    expect(total).toBeGreaterThan(29); // ~31 m minus corner quantization
    expect(gl.beginReel([0, 0, 1])).toBe(true);
    holdReel(gl, [0, 0, 1], 60);
    expect(gl.deployed).toBe(false); // the WHOLE zigzag came back
    expect(gl.reelM).toBeCloseTo(G.reelLengthM, 0);
  });

  it('a tie-off PINS the line: reeling stops there until the tie is cut', () => {
    const gl = new GuideLine();
    gl.toggleLaying([0, 0, 0]);
    swim(gl, [0, 0, 0], [10, 0, 0]);
    gl.pin([10, 0, 0]); // tie-off mid-route
    swim(gl, [10, 0, 0], [20, 0, 0]);
    gl.toggleLaying([20, 0, 0]);
    gl.beginReel([20, 0, 0]);
    const hand: Vec3 = [20, 0, 0];
    holdReel(gl, hand, 60);
    // blocked at the tie: the protected stretch (anchor→tie) survives
    expect(gl.deployed).toBe(true);
    expect(gl.reelBlocked).toBe(true);
    expect(gl.deployedLengthM).toBeCloseTo(10, 0);
    const end = gl.strands[0].points[gl.strands[0].points.length - 1];
    expect(end[0]).toBeCloseTo(10, 0);
    // cut the tie → reeling continues to the anchor and stows
    gl.endReel();
    expect(gl.unpin(hand)).toBe(true);
    gl.beginReel(hand);
    holdReel(gl, hand, 60);
    expect(gl.deployed).toBe(false);
    expect(gl.reelM).toBeCloseTo(G.reelLengthM, 0);
  });

  it('releasing X mid-reel leaves the remaining line stopped and grabbable', () => {
    const gl = new GuideLine();
    gl.toggleLaying([0, 0, 0]);
    swim(gl, [0, 0, 0], [10, 0, 0]);
    gl.beginReel([10, 0, 0]);
    swim(gl, [10, 0, 0], [6, 0, 0]);
    gl.endReel();
    expect(gl.mode).toBe('stopped');
    expect(gl.deployed).toBe(true);
    const end = gl.strands[0].points[gl.strands[0].points.length - 1];
    expect(gl.toggleLaying(end)).toBe('resumed');
  });
});

describe('follow mode — latched direction, free look', () => {
  it('latches direction at engage and keeps it regardless of look', () => {
    const gl = new GuideLine();
    gl.toggleLaying([0, 0, 0]);
    swim(gl, [0, 0, 0], [10, 0, 0]);
    expect(gl.followBegin([5, 1, 0], [1, 0, 0])).toBe(true); // engage facing +x
    const v1 = gl.followVelocity([5, 1, 0]);
    expect(v1![0]).toBeGreaterThan(2); // travels +x
    const v2 = gl.followVelocity([6, 0.5, 0]);
    expect(v2![0]).toBeGreaterThan(2);
    gl.followEnd();
    expect(gl.followVelocity([5, 1, 0])).toBeNull();
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
