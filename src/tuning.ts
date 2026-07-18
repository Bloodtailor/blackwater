// Every gameplay number lives here (DESIGN.md §16 rule 2). No magic numbers in systems.
// v1 values are DESIGN.md guesses; Milestone 9 owns changing them.

export const TUNING = {
  player: {
    swimSpeed: 4.0, // m/s
    sprintSpeed: 6.5,
    squeezeSpeed: 1.6,
    walkSpeed: 5.0,
    accelTime: 0.4, // s to reach speed
    glideTime: 0.6, // s to stop
    freeflySpeed: 8.0, // debug camera
    radius: 0.45, // collision clearance from cave walls
  },
  geometry: {
    cellSize: 0.7, // marching grid resolution (m)
    radiusOpen: 2.4, // tunnel radii by width class (m)
    radiusNormal: 1.6,
    radiusSqueeze: 0.75,
    noiseFreq: 0.35,
    noiseAmpFactor: 0.15, // wall noise amplitude = clamp(r * factor, 0.12, max)
    noiseAmpMax: 0.9,
    doorBlockPad: 1.0, // door plug (disc) radius = tunnel radius + pad
    doorBlockHalfLen: 0.5, // disc half-thickness along the tunnel axis
  },
  air: {
    capacity: 100,
    drainPerSec: 1,
    sprintMult: 1.6,
    grabLoss: 8,
    refillPerSec: 25,
    lowThreshold: 25,
    drownHpPerSec: 15,
    zoneMult: { sinkhole: 1.0, galleries: 1.0, maze: 1.1, throat: 1.25, abyss: 1.25 },
  },
  health: {
    max: 100,
    regenDelay: 5,
    regenDuration: 4,
    grabDamage: 35,
    guardianDamage: 70,
  },
  light: {
    batterySeconds: 300,
    dimBelow: 0.5, // battery fraction where dimming starts
    flickerBelow: 0.2,
    beamAngleDeg: 60,
    siltBeamAngleDeg: 25,
  },
  tilt: {
    driftDegPerSec: 15,
    decayDegPerSec: 2,
    relevelDegPerSec: 45,
    zoneMaxDeg: { galleries: 30, maze: 90, throat: 180 },
  },
  silt: {
    ambientVisM: 12,
    ambientSettleSec: 20,
    siltoutVisM: 4,
    siltoutFadeSec: 75,
  },
  visibility: {
    clearVisM: { sinkhole: 35, galleries: 35, maze: 25, throat: 18, abyss: 18 },
  },
  rounds: {
    intermissionSec: 40,
    baseCount: 6,
    perRound: 4,
    countCap: 60,
    aliveCap: 9,
    caveStirs: { minRemaining: 3, fraction: 0.15, maxRemaining: 10, countdownSec: 45 },
  },
  zombies: {
    baseSpeed: 2.8,
    speedPerRound: 0.12,
    speedCap: 5.5,
    baseHp: 150,
    hpGrowth: 1.12,
    hpGrowthLate: 1.18,
    lateRound: 20,
  },
  economy: {
    startPoints: 500,
    hit: 10,
    kill: 60,
    headshotKill: 100,
    meleeKill: 130,
    boxCost: 950,
    papCost: 5000,
    papAmmo: 4500,
    batteryCost: 250,
    chemlightPackCost: 250,
    reelCost: 750,
  },
  guideLine: {
    reelLengthM: 200,
    maxDeployedM: 400,
    followSpeed: 3.5,
    grabRadiusM: 1.5,
  },
} as const;
