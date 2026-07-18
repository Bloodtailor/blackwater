// Every gameplay number lives here (DESIGN.md §16 rule 2). No magic numbers in systems.
// v1 values are DESIGN.md guesses; Milestone 9 owns changing them.

export const TUNING = {
  player: {
    swimSpeed: 4.0, // m/s
    sprintSpeed: 6.5,
    squeezeSpeed: 1.6,
    walkSpeed: 5.0,
    accelTime: 0.55, // s to reach speed (silky/icy per user)
    glideTime: 1.5, // s glide-out (long — icy)
    freeflySpeed: 8.0, // debug camera
    radius: 0.42, // collision clearance from cave walls
    eyeHeight: 1.05, // camera above the body point when walking
    gravity: 14, // walk-mode gravity (m/s²) — snappy, game-feel not physics
    jumpSpeed: 7.0, // walk-mode jump — high + snappy (dolphin dive)
    coyoteTime: 0.12, // s of jump grace after leaving the ground
    lungeImpulse: 3.5, // sprint-trigger lunge (m/s added)
    lungeSqueezeFactor: 0.7, // lunges still fire in squeezes, most of the punch
    lungeCooldown: 1.2, // s ("lunge protection")
    currentSpeed: 1.2, // ambient wandering current peak (m/s) — fight it or ride it
    currentFreq: 0.02, // spatial frequency of current wander
    currentTimeFreq: 0.12, // temporal drift — quick shifts, smooth transitions
    // Streamline momentum (user, 2026-07-18): holding one direction builds
    // speed toward sprintSpeed even without sprint; direction changes dump it.
    streamline: {
      buildPerSec: 0.45, // no-sprint build rate (~2.2 s to full)
      sprintBuildPerSec: 1.4, // sprint builds much faster and maintains
      idleDecayPerSec: 0.25,
      breakDot: 0.6, // wish·vel below this = direction change, dump speed
      breakDecayPerSec: 3,
    },
  },
  hr: {
    rest: 60, // bpm
    max: 180,
    sprintTarget: 150, // sustained sprint climbs toward this
    sprintLoadTime: 8, // s of sprinting to reach the full sprint HR target
    riseTau: 2.0, // s lag — HR reflects effort a beat or two later
    fallTau: 7.0, // recovery is slower than the rise
    lungeSpike: 20, // bpm added to target per lunge
    damageSpike: 30, // bpm added when hit
    spikeCap: 70,
    spikeDecayTau: 3.5,
    panicTarget: 172, // reserve-breath HR floor
  },
  geometry: {
    cellSize: 0.6, // marching grid resolution (m) — finer mesh tracks the collision field closer
    radiusOpen: 2.4, // tunnel radii by width class (m)
    radiusNormal: 1.6,
    radiusSqueeze: 0.75,
    noiseFreq: 0.35,
    noiseAmpFactor: 0.15, // wall noise amplitude = clamp(r * factor, 0.12, max)
    noiseAmpMax: 0.9,
    doorBlockPad: 0.5, // door plug (disc) radius = tunnel radius + pad (still seals: noise ≤ 0.24)
    doorBlockHalfLen: 0.5, // disc half-thickness along the tunnel axis
  },
  air: {
    capacity: 100,
    drainPerSec: 1, // at resting HR; actual drain scales ×(hr/rest)
    grabLoss: 8,
    refillPerSec: 25,
    lowThreshold: 25,
    reserveSeconds: 8, // the flashing-red last breath
    reserveRearmAt: 50, // refill past this to re-arm the reserve
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
