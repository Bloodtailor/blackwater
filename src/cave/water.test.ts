import { describe, expect, it } from 'vitest';
import { AIR_LEVEL_Y, SUBMERGED_LEVEL_Y, waterSurfaceLevel, type WaterSurface } from './data';

// The head-above rule everywhere in the game is `p.y > level`.
const headAbove = (ws: WaterSurface, x: number, y: number, z: number): boolean => y > waterSurfaceLevel(ws, x, y, z);

describe('waterSurfaceLevel', () => {
  it('flat plane: level is constant, classification splits on y', () => {
    const ws: WaterSurface = { kind: 'plane', y: -20, up: [0, 1, 0], c: [5, 5] };
    expect(waterSurfaceLevel(ws, 0, -10, 0)).toBeCloseTo(-20);
    expect(headAbove(ws, 3, -19, 9)).toBe(true);
    expect(headAbove(ws, 3, -21, 9)).toBe(false);
  });

  it('30° tilt: level slopes across x, classification matches the plane side', () => {
    const up: [number, number, number] = [0.5, Math.sqrt(3) / 2, 0];
    const ws: WaterSurface = { kind: 'plane', y: -50, up, c: [0, 0] };
    expect(waterSurfaceLevel(ws, 0, -50, 0)).toBeCloseTo(-50);
    // downhill side (x>0): level drops at slope up.x/up.y
    expect(waterSurfaceLevel(ws, 2, -50, 0)).toBeCloseTo(-50 - 2 * (0.5 / (Math.sqrt(3) / 2)));
    // a point above the tilted plane on the downhill side is air even though
    // it is BELOW the pivot height
    expect(headAbove(ws, 4, -51, 0)).toBe(true);
    expect(headAbove(ws, -4, -49, 0)).toBe(false); // uphill side, under the plane
  });

  it('90° tilt: vertical surface splits the room sideways, not by height (user bug 2026-07-19)', () => {
    const ws: WaterSurface = { kind: 'plane', y: -55, up: [1, 0, 0], c: [10, 0] };
    // air side (+x of the plane) is air at ANY depth
    expect(waterSurfaceLevel(ws, 12, -60, 0)).toBe(AIR_LEVEL_Y);
    expect(headAbove(ws, 12, -60, 0)).toBe(true);
    // water side is submerged even ABOVE the pivot height
    expect(waterSurfaceLevel(ws, 8, -50, 0)).toBe(SUBMERGED_LEVEL_Y);
    expect(headAbove(ws, 8, -50, 0)).toBe(false);
  });

  it('inverted plane (up pointing down): air is below, water above', () => {
    const ws: WaterSurface = { kind: 'plane', y: -30, up: [0, -1, 0], c: [0, 0] };
    expect(headAbove(ws, 0, -35, 0)).toBe(true); // below the plane = air side
    expect(headAbove(ws, 0, -25, 0)).toBe(false);
  });

  it('air region: bottomless level, always head-above', () => {
    const ws: WaterSurface = { kind: 'air' };
    expect(headAbove(ws, 0, -199, 0)).toBe(true);
  });

  it('tunnel gap: level follows the local ceiling minus the gap', () => {
    const ws: WaterSurface = { kind: 'gap', pts: [[0, -50, 0], [10, -45, 0]], r: 1.6, gap: 0.5 };
    // near the low end: ceiling −50+1.6, level 0.5 below it
    expect(waterSurfaceLevel(ws, 0, -50, 0)).toBeCloseTo(-48.9);
    // near the high end the level has climbed with the passage
    expect(waterSurfaceLevel(ws, 10, -45, 0)).toBeCloseTo(-43.9);
  });
});
