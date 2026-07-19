// Every gameplay number lives here (DESIGN.md §16 rule 2). No magic numbers in systems.
// v1 values are DESIGN.md guesses; Milestone 9 owns changing them.

export const TUNING = {
  // ═══════════════════════════════════════════════════════════════════
  // MOVEMENT — the feel numbers. Edit while the game runs; it hot-reloads.
  // ═══════════════════════════════════════════════════════════════════
  player: {
    // ── speeds (m/s) ──
    swimSpeed: 4.0, // top speed without built momentum
    sprintSpeed: 6.5, // top speed at full streamline momentum
    squeezeSpeed: 1.6, // forced crawl inside squeezes
    walkSpeed: 5.0, // on dry land

    // ── heaviness: how hard it is to get moving / stop / turn ──
    // Higher thrust = lighter feel. Lower drag = coasts longer.
    swimThrust: 3.2, // m/s² of swim thrust ("300 lb" was 1.6; half as heavy now)
    sprintThrust: 5.6, // m/s² while sprinting
    waterDrag: 0.12, // fraction of speed lost per second while coasting

    // ── lunge (sprint-trigger burst) ──
    lungeImpulse: 6.5, // max Δv a lunge can apply (fully cancels opposing top speed)
    lungeMaxBoost: 3.0, // a lunge never pushes your speed ABOVE this in its direction
    lungeSqueezeFactor: 0.7, // squeezes keep most of the punch
    lungeCooldown: 1.2, // s ("lunge protection")

    // ── surface: floating, breaching, diving back in ──
    floatHeight: 0.35, // buoyancy holds your head about this far above the line
    buoyancy: 18, // upward spring strength near the surface
    surfaceDamp: 2, // vertical damping near the line (stops pogo-bobbing)
    splashDampY: 0.4, // entering water scales falling speed by this (dive brake)
    splashDampXZ: 0.7, // ...and horizontal speed by this
    breachThrustCut: 0.1, // thrust multiplier once you're clear of the water

    // ── walking & jumping ──
    gravity: 14, // m/s² on land (game-feel, not physics)
    jumpSpeed: 7.0, // jump takeoff — high + snappy (dolphin dives)
    coyoteTime: 0.12, // s of jump grace after leaving the ground

    // ── ambient current ──
    currentSpeed: 2.0, // peak push (m/s); no floor — real lulls happen
    currentFreq: 0.02, // spatial wander scale
    currentTimeFreq: 0.03, // how fast it shifts over time (higher = twitchier)
    // depth bands (user 2026-07-18): 0–50 m shallow ×, 50–100 m mid ×,
    // 100 m+ deep ×, soft-blended over blendM around each boundary
    currentDepth: {
      shallowFactor: 0.7,
      midFactor: 1.0,
      deepFactor: 1.7,
      shallowToMidM: 50,
      midToDeepM: 100,
      blendM: 15,
    },

    // ── the wet slide (one-way chute; user 2026-07-18) ──
    slideAccel: 9, // m/s² downhill — you do not climb this
    slideMaxSpeed: 8,
    slideControl: 2.0, // tiny lateral nudge while sliding

    // ── streamline momentum ──
    streamline: {
      buildPerSec: 0.45, // no-sprint build rate (~2.2 s to full)
      sprintBuildPerSec: 1.4, // sprint builds much faster and maintains
      idleDecayPerSec: 0.25,
      breakDot: 0.6, // wish·vel below this = direction change, dump speed
      breakDecayPerSec: 3,
    },

    // ── squeeze view cone (user 2026-07-18: too tight to look behind you) ──
    squeezeConeDeg: 30, // max look angle off the passage direction
    squeezeConeTightness: 4, // mouse slowdown curve: exp(−tightness·(θ/cone)²)
    squeezeConePullDegPerSec: 100, // entering off-axis: head forced forward

    // ── misc ──
    freeflySpeed: 8.0, // debug noclip camera
    radius: 0.42, // collision clearance from cave walls
    eyeHeight: 1.05, // camera above the body point when walking
    manualRollDegPerSec: 70, // Q/E camera roll (user 2026-07-19; X removed)
    grabWallDistM: 0.55, // Ctrl grabs the wall when rock is this close
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
    cellSize: 0.5, // marching grid resolution (m) — finer cells catch thin rock walls the mesh used to drop (ghost-wall hunt 2026-07-19)
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
    beamAngleDeg: 84, // full cone; DESIGN said 60 but M3 shipped this look
    siltBeamAngleDeg: 25, // full cone during a silt-out (backscatter)
    siltThrowM: 22, // beam throw during a silt-out (vs 65 clear)
  },
  tilt: {
    driftDegPerSec: 15,
    decayDegPerSec: 2,
    relevelDegPerSec: 45,
    wanderFreq: 0.07, // how fast the drift direction wanders (noise time scale)
    zoneMaxDeg: { galleries: 30, maze: 90, throat: 180 },
  },
  silt: {
    ambientVisM: 12,
    ambientSettleSec: 20,
    stirSec: 2.5, // seconds of disturbance to fully stir a chamber
    stirSpeed: 2.5, // swimming faster than this near a silty floor stirs
    floorProximityM: 1.5, // "near the floor" for stirring
    siltoutVisM: 4,
    siltoutFadeSec: 75,
    moundTouchM: 1.1, // touching within this of a mound detonates it
  },
  visibility: {
    clearVisM: { sinkhole: 35, galleries: 35, maze: 25, throat: 18, abyss: 18 },
    fogK: 1.7, // fog density = fogK / visibility (FogExp2)
    lerpPerSec: 1.2, // how fast fog chases its target (zone/silt transitions)
  },
  atmosphere: {
    particulateCount: 9000, // mote buffer; base density uses ~2/3, silt-outs fill the rest
    particulateBaseMaxFrac: 0.66, // deep-water base fraction (silt boost can exceed)
    particulateDepthMinFrac: 0.24, // fraction of motes rendered at the surface
    particulateFullDepthM: 55, // full mote density at/below this depth
    particulateBoxM: 10, // they wrap inside a box this wide around the camera
    particulateFadeNearM: 1.6, // full brightness inside this camera distance…
    particulateFadeFarM: 7.5, // …fading to nothing by this distance
    siltParticleMax: 2600, // camera-local silt cloud budget
    siltCloudRadiusM: 9,
    depthDarkStart: 6, // ambient light starts fading below this depth (m)
    depthDarkEnd: 45, // fully dark by this depth
    depthDarkFloor: 0.12, // fraction of ambient that survives at full depth
  },
  chemlights: {
    startCount: 0, // they're a wall buy; debug grants for testing
    packSize: 10,
    worldCap: 40, // oldest fade beyond this
    throwSpeed: 5,
    sinkAccel: 2.2, // they sink gently to the floor
    waterDrag: 0.6, // fraction of velocity lost per second
    lightRadiusM: 6, // pooled real lights on the nearest few
    lightPool: 6,
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
    tieSeconds: 4, // hold F while wall-grabbing to set an anchor/tie-off
    pointSpacingM: 1.0, // line vertices laid this far apart while paying out
    reelInRadiusM: 2.2, // walking the line back re-reels points inside this
    followPullPerSec: 3, // how hard follow mode pulls you onto the line
  },
} as const;
