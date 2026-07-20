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
    firstRoundDelaySec: 8, // grace before round 1 after the dive starts
    baseCount: 6,
    perRound: 4,
    countCap: 60,
    aliveCap: 9,
    // spawn pacing: seconds between spawns, accelerating with the round
    spawnEverySec: 2.4,
    spawnEveryMinSec: 1.0,
    spawnAccelPerRound: 0.08,
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
    // ── body & movement ──
    radius: 0.38, // collision clearance (fits squeezes; player is 0.42)
    turnRatePerSec: 3.0, // how fast velocity chases the desired direction
    squeezeSpeed: 1.9, // forced slow inside squeezes (player: 1.6)
    landSpeedFactor: 0.65, // crawling out of the pool onto dry rock
    directChaseM: 25, // clear line of sight closer than this = swim straight at you
    repathSec: 2.0, // path recompute cadence while pursuing
    stuckRepathSec: 2.5, // no progress for this long = force repath + wall nudge
    minSpawnDistM: 12, // burrows closer than this to the player are skipped
    emergeSec: 1.1, // rising out of the burrow crack
    // ── crowd behavior (user 2026-07-20: no clumping into one point, no
    // synchronized hit-bursts, stuck bodies must recycle) ──
    speedVariance: 0.15, // per-zombie ±15% — the pack strings out
    separationRadiusM: 0.95, // bodies shoulder each other apart inside this
    separationPush: 2.4, // how hard they jostle
    maxConcurrentAttackers: 3, // the rest crowd and wait their turn
    grabWindupJitterSec: 0.4, // extra random windup per attack (desyncs hits)
    stuckDespawnSec: 12, // no progress this long → burrow back down…
    stuckDespawnMinDistM: 8, // …but never vanish in front of the player
    // ── the grab (procedural handling, DESIGN §8.1) ──
    grabRangeM: 1.35,
    grabWindupSec: 0.55, // firm, unhurried reach before the grab lands
    grabCooldownSec: 1.9,
    grabShoveSpeed: 2.5, // velocity kick into the player
    grabTiltKickDeg: 22, // brief roll kick (the regulator rip)
    // ── death & corpses (go limp and drift, DESIGN §8.1) ──
    corpseDriftSec: 5.5,
    corpseFadeSec: 2.0,
    // ── workstation-pause idle (LORE §4: remembering a task) ──
    pauseChance: 0.25, // chance to pause when drifting past an old station
    pauseSec: 3.0,
    pauseNearM: 3.5,
    pauseCooldownSec: 20, // per-zombie, so nobody loops the same desk
  },
  weapons: {
    // Wall arsenal (DESIGN §10.1). Mechanical identity per gun (single/auto/
    // spread/pierce/stab); the deeper feel polish is M6b's. Box guns land M6b.
    wristDart: {
      damage: 20,
      headshotMult: 3,
      magSize: 8,
      reserveMax: 80,
      fireDelaySec: 0.32,
      reloadSec: 1.6,
      rangeM: 45,
    },
    speargun: {
      damage: 130, // strong single — one-shots through round 1–2 bodies
      headshotMult: 2,
      magSize: 8,
      reserveMax: 40,
      fireDelaySec: 0.75,
      reloadSec: 2.2,
      rangeM: 55,
    },
    pneuDriver: {
      damage: 18, // pneumatic dart hose — volume, not punch
      headshotMult: 2.5,
      magSize: 24,
      reserveMax: 120,
      fireDelaySec: 0.09,
      reloadSec: 1.8,
      rangeM: 40,
    },
    flechette: {
      damage: 16, // per pellet
      pellets: 8,
      spreadDeg: 7,
      headshotMult: 2,
      magSize: 6,
      reserveMax: 36,
      fireDelaySec: 0.85,
      reloadSec: 2.6,
      rangeM: 18, // scatter dies fast in water
    },
    harpoon: {
      damage: 200, // slow, heavy, keeps going
      pierce: 3, // bodies one bolt can nail together
      headshotMult: 2,
      magSize: 4,
      reserveMax: 24,
      fireDelaySec: 1.25,
      reloadSec: 2.8,
      rangeM: 60,
    },
    lineLance: {
      damage: 170, // fast stab, melee range, 2-target pierce; no ammo economy
      stabRangeM: 3.0,
      stabPierce: 2,
      fireDelaySec: 0.5,
    },
    // ── box-only guns (DESIGN §10.2, M6b) ──
    twinfish: {
      damage: 60, // akimbo spear pistols: one trigger, both hands
      burst: 2,
      burstSpreadDeg: 2.5,
      headshotMult: 2.5,
      magSize: 12, // consumed in pairs
      reserveMax: 72,
      fireDelaySec: 0.34,
      reloadSec: 2.0,
      rangeM: 40,
    },
    arcProjector: {
      damage: 150, // chain lightning — water conducts (room-clearer, rare)
      chainCount: 4,
      chainRadiusM: 8,
      chainFalloff: 0.7, // damage multiplier per jump
      headshotMult: 1,
      magSize: 6,
      reserveMax: 24,
      fireDelaySec: 0.9,
      reloadSec: 2.6,
      rangeM: 35,
    },
    vortexMaw: {
      damage: 30, // utility: drags the room into a point
      vortexRadiusM: 10,
      vortexPullSec: 0.9,
      vortexPullSpeed: 9,
      headshotMult: 1,
      magSize: 4,
      reserveMax: 16,
      fireDelaySec: 1.2,
      reloadSec: 2.8,
      rangeM: 30,
    },
    sonicLance: {
      damage: 120, // piercing beam — everything on the line
      pierce: 99,
      headshotMult: 1.5,
      magSize: 8,
      reserveMax: 32,
      fireDelaySec: 0.7,
      reloadSec: 2.2,
      rangeM: 45,
    },
    bangStick: {
      damage: 8000, // one-hit stab (BO1 ballistic-knife energy); shell-per-shot
      stabRangeM: 2.5,
      stabPierce: 1,
      magSize: 1,
      reserveMax: 12,
      fireDelaySec: 0.4,
      reloadSec: 1.5,
    },
    knife: {
      damage: 150, // one-knife at round 1 (BO1 tradition)
      rangeM: 2.3,
      arcDeg: 55, // swing catches targets this far off view center
      cooldownSec: 0.85,
    },
  },
  perks: {
    // DESIGN §10.5 — pick 4 of 9. Costs + effect numbers.
    cap: 4,
    barnacleHide: { cost: 2500, maxHp: 220 },
    secondWind: { cost: 1500, blackoutSec: 2.4 },
    greasedGears: { cost: 3000, reloadMult: 0.5 },
    triggerFish: { cost: 2000, fireDelayMult: 1 / 1.3 }, // +30% fire rate
    deepPockets: { cost: 4000, slots: 3 },
    ironLungs: { cost: 2500, airCap: 150, drainMult: 0.85 },
    catEyes: { cost: 2000, visMult: 1.4, beamWidenMult: 1.25 },
    finKick: { cost: 2000, speedMult: 1.15, sprintDrainMult: 0.8 },
    steadyHands: { cost: 1500, tiltDecayMult: 3 },
  },
  box: {
    // Requisition Roulette (DESIGN §10.2, LORE §4): several crates exist, one
    // is live; rarely the pull is a wind-up toy diver and the crate moves.
    spinSec: 3.0, // lid open, names cycling
    takeSec: 8.0, // window to take the offered gun before it sinks back
    moveFreeSpins: 3, // no tease before this many spins at one crate
    moveChance: 0.15, // per spin after the free spins…
    moveGuaranteedSpin: 12, // …and the 12th pull always moves it
    boxGunWeight: 0.7, // box-only guns draw at this weight vs 1.0 wall guns
  },
  pap: {
    // The Bench (DESIGN §10.6, LORE §4): ×2.5 damage, bigger mag, rename,
    // per-gun quirk, and the universal rule — PaP projectiles EMIT LIGHT.
    damageMult: 2.5,
    magMult: 1.5,
    reserveMult: 1.5,
    benchSec: 3.0, // the machine works the weapon
    takeSec: 10.0,
    impactLightIntensity: 14, // the glow a papped shot leaves at impact
    impactLightSec: 0.35,
    impactLightRadiusM: 9,
  },
  drops: {
    // §10.7: ~2% + pity. Weights are relative draw odds.
    chance: 0.02,
    pityKills: 40, // a drop is guaranteed within this many kills
    despawnSec: 30,
    pickupRadiusM: 1.6,
    doublePointsSec: 60,
    instaKillSec: 30,
    clearWatersSec: 30,
    clearWatersVisMult: 1.15,
    pressureWaveAward: 400, // flat points for the room-clear (BO1 nuke custom)
    weights: { maxAmmo: 22, doublePoints: 22, instaKill: 22, clearWaters: 14, batterySurge: 14, pressureWave: 6 },
  },
  specials: {
    // The Angler (DESIGN §8.2): a lure that reads as somebody's chemlight.
    angler: {
      fromRound: 8,
      spawnChanceAtRoundStart: 0.5, // if none alive, dark zones only
      minSpawnDistM: 25,
      hp: 600,
      cruiseSpeed: 1.1, // idle drift around the lure spot
      lungeSpeed: 7.5,
      lungeTriggerM: 4.5, // takes you when you commit to the light
      lungeWindupSec: 0.35,
      damage: 45,
      killPoints: 200,
      lureBobAmp: 0.35,
    },
    // The Silt Shade (DESIGN §8.2): lives exactly as long as the silt-out.
    shade: {
      hp: 250,
      speed: 3.6,
      damage: 25,
      spawnDelaySec: 3, // the cloud thickens, then something is in it
      grabCooldownSec: 1.6,
      killPoints: 100,
    },
    // Guardians (DESIGN §8.3): the condemned suits still walking their posts.
    guardian: {
      hp: 4000, // killable, barely worth it — they walk again next round
      patrolSpeed: 1.3,
      aggroSpeed: 4.8,
      damage: 60, // the heavy hit
      hitShove: 5,
      hitAirLoss: 6,
      proximityAggroM: 4, // tier 1: you brushed the post
      lightAggroM: 14, // tier 2: your lamp at range
      sprintLightAggroM: 22, // tier 3: loud AND lit
      calmSec: 6, // loses you, walks back
      leashM: 32,
      attackRangeM: 2.2,
      attackWindupSec: 0.7,
      killPoints: 500,
    },
    biolum: { count: 900, sizeM: 0.06 }, // the Cathedral's own faint light
  },
  ascent: {
    // Grab the Heart → the site objects, all the way up (DESIGN §11).
    grabHoldSec: 1.5,
    zombieSpeedCapMult: 0.76, // ascent zombies stay outswimmable
    spawnEverySec: 3.5, // global pressure, alive cap still rules
    visMult: 0.75, // one grade darker on the way out
    heartLightIntensity: 9,
    heartLightRadiusM: 13,
  },
  interact: {
    reachM: 2.7, // how close E can act from
    coneDeg: 42, // how far off view center a target can sit
    doorHoldSec: 1.2, // grinding a choke/grate/hatch open
    powerHoldSec: 1.5, // the Pile's breaker is theatrical
    doorGrindSec: 1.2, // open animation length
  },
  power: {
    lightSpacingM: 3.2, // string-light bulb spacing along the arteries
    bulbBelowCeilingM: 0.4,
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
    // wall-gun price sheet (DESIGN §10.1); ammo refill = half gun cost
    gunCost: { speargun: 500, pneuDriver: 1000, flechette: 1250, harpoon: 1500, lineLance: 1750 },
  },
  voice: {
    // ── Lowe + tapes (LORE §2.1/§5 anti-spam; silence is the default) ──
    ambientChance: 0.4, // ambient lines roll this even when off cooldown
    ambientCooldownSec: 120, // global gap between ambient lines
    tapeSafeRadiusM: 20, // a tape won't start with an enemy inside this
    idleAfterSec: 45, // platform stillness before an idle line may roll
    closeCallAir: 15, // surfacing under this air = a close-call event
    voGain: 0.9, // fallback-squelch level rides volumeVo too
    jukeboxGain: 0.22, // the song is far away, everywhere (LORE §6)
    shimmerRefDistM: 2.2, // toy music-box shimmer ≈ audible ≤8 m
  },
  audio: {
    // ── the M8a synth soundscape; volumes are 0..1 pre-master gains ──
    underwaterLowpassHz: 850, // the global "you are underwater" filter
    siltMuffleHz: 450, // low-pass floor during a full silt-out ("cottony")
    occlusionLowpassHz: 420, // sound through rock: duller…
    occlusionGain: 0.35, // …and quieter (§13 honest sound)
    sfxGain: 0.8, // weapons/impacts/interactions family volume
    musicGain: 0.7, // stingers/jingles/motifs family volume
    breathGain: 0.9, // the regulator cycle
    moanGain: 0.5, // per-moan pre-positional level
    anglerGain: 0.16, // the lure hum is deliberately FAINT
    guardianGain: 0.5, // sub-bass presence
    moanIntervalSec: 7, // mean seconds between moans (scales down with crowd)
    moanRefDistM: 7, // distance where a moan is at half power
    anglerRefDistM: 5,
    guardianRefDistM: 8,
    whumpRefDistM: 12, // a silt-out is a big event — carries far
    geigerRangeM: 14, // crackle radius around the Pile (flavor only)
  },
  guideLine: {
    reelLengthM: 200,
    maxDeployedM: 400,
    followSpeed: 3.5,
    grabRadiusM: 1.5,
    tapHoldSeconds: 0.3, // T/X shorter than this = tap, longer = hold action
    anchorReachM: 2.0, // starting a line auto-anchors to rock within this
    pointSpacingM: 1.0, // line vertices laid this far apart while paying out
    reelInRadiusM: 2.2, // reeling collects points inside this
    followPullPerSec: 3, // how hard follow/reel pulls you onto the line
  },
} as const;

// ── live tuning overrides (editor/debug panels, user 2026-07-19) ──
// Overrides live in localStorage so a tweak made in the level editor carries
// into a playtest tab and back. They mutate TUNING in place at load; values
// read per-frame pick them up live too.

const OVERRIDE_KEY = 'bw-tuning-overrides';

type AnyObj = Record<string, unknown>;

function leafAt(path: string): { obj: AnyObj; key: string } | null {
  const parts = path.split('.');
  let obj = TUNING as unknown as AnyObj;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = obj[parts[i]];
    if (typeof next !== 'object' || next === null) return null;
    obj = next as AnyObj;
  }
  return { obj, key: parts[parts.length - 1] };
}

function loadOverrides(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(OVERRIDE_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

/** The pristine DESIGN values, captured before overrides apply. */
const DEFAULTS: Record<string, number> = {};

/** Every numeric knob as a dotted path, in declaration order. */
export function listTuningPaths(): string[] {
  const paths: string[] = [];
  const walk = (obj: AnyObj, prefix: string): void => {
    for (const [k, v] of Object.entries(obj)) {
      const p = prefix ? `${prefix}.${k}` : k;
      if (typeof v === 'number') paths.push(p);
      else if (typeof v === 'object' && v !== null) walk(v as AnyObj, p);
    }
  };
  walk(TUNING as unknown as AnyObj, '');
  return paths;
}

export function getTuningValue(path: string): number {
  const l = leafAt(path);
  return l ? (l.obj[l.key] as number) : NaN;
}

export function getTuningDefault(path: string): number {
  return DEFAULTS[path] ?? getTuningValue(path);
}

/** Set (v: number) or clear (v: undefined) an override; mutates TUNING live. */
export function setTuningValue(path: string, v: number | undefined): void {
  const l = leafAt(path);
  if (!l) return;
  const overrides = loadOverrides();
  if (v === undefined || v === DEFAULTS[path]) {
    delete overrides[path];
    l.obj[l.key] = DEFAULTS[path] ?? l.obj[l.key];
  } else {
    overrides[path] = v;
    l.obj[l.key] = v;
  }
  try {
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify(overrides));
  } catch {
    // storage unavailable — the in-memory value still applies this session
  }
}

export function clearTuningOverrides(): void {
  for (const p of Object.keys(loadOverrides())) {
    const l = leafAt(p);
    if (l && DEFAULTS[p] !== undefined) l.obj[l.key] = DEFAULTS[p];
  }
  try {
    localStorage.removeItem(OVERRIDE_KEY);
  } catch {
    // ignore
  }
}

export function tuningOverrideCount(): number {
  return Object.keys(loadOverrides()).length;
}

// capture defaults, then apply stored overrides
for (const p of listTuningPaths()) DEFAULTS[p] = getTuningValue(p);
for (const [p, v] of Object.entries(loadOverrides())) {
  if (typeof v === 'number') {
    const l = leafAt(p);
    if (l && typeof l.obj[l.key] === 'number') l.obj[l.key] = v;
  }
}
