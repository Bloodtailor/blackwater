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
      shallowFactor: 0.7, // current strength multiplier, 0 to shallowToMidM
      midFactor: 1.0, // current strength multiplier in the mid band
      deepFactor: 1.7, // current strength multiplier below midToDeepM (the deep gets mean)
      shallowToMidM: 50, // depth (m) where the shallow band ends
      midToDeepM: 100, // depth (m) where the deep band starts
      blendM: 15, // meters of smooth blend at each band boundary
    },

    // ── the wet slide (one-way chute; user 2026-07-18) ──
    slideAccel: 9, // m/s² downhill — you do not climb this
    slideMaxSpeed: 8, // terminal speed on wet slides (m/s)
    slideControl: 2.0, // tiny lateral nudge while sliding

    // ── streamline momentum ──
    streamline: {
      buildPerSec: 0.45, // no-sprint build rate (~2.2 s to full)
      sprintBuildPerSec: 1.4, // sprint builds much faster and maintains
      idleDecayPerSec: 0.25, // streamline momentum lost per second while coasting
      breakDot: 0.6, // wish·vel below this = direction change, dump speed
      breakDecayPerSec: 3, // streamline momentum lost per second on direction change
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
    max: 180, // absolute heart-rate ceiling (bpm)
    sprintTarget: 150, // sustained sprint climbs toward this
    sprintLoadTime: 8, // s of sprinting to reach the full sprint HR target
    riseTau: 2.0, // s lag — HR reflects effort a beat or two later
    fallTau: 7.0, // recovery is slower than the rise
    lungeSpike: 20, // bpm added to target per lunge
    damageSpike: 30, // bpm added when hit
    spikeCap: 70, // max bpm the transient spike pool can hold
    spikeDecayTau: 3.5, // seconds for a spike to decay to ~37%
    panicTarget: 172, // reserve-breath HR floor
  },
  geometry: {
    cellSize: 0.5, // marching grid resolution (m) — finer cells catch thin rock walls the mesh used to drop (ghost-wall hunt 2026-07-19)
    radiusOpen: 2.4, // tunnel radii by width class (m)
    radiusNormal: 1.6, // carve radius of normal tunnels (m)
    radiusSqueeze: 0.75, // carve radius of squeezes (m) - single body width
    noiseFreq: 0.35, // rock-surface noise frequency (bumpiness scale)
    noiseAmpFactor: 0.15, // wall noise amplitude = clamp(r * factor, 0.12, max)
    noiseAmpMax: 0.9, // max rock-surface noise amplitude (m)
    doorBlockPad: 0.5, // door plug (disc) radius = tunnel radius + pad (still seals: noise ≤ 0.24)
    doorBlockHalfLen: 0.5, // disc half-thickness along the tunnel axis
  },
  air: {
    capacity: 100, // tank size (air units; drains ~1/s at rest)
    drainPerSec: 1, // at resting HR; actual drain scales ×(hr/rest)
    grabLoss: 8, // air ripped away by a zombie grab (the regulator rip)
    refillPerSec: 25, // refill rate at surface/pockets (units per second)
    lowThreshold: 25, // low-air state at or below this (heartbeat, vignette)
    reserveSeconds: 8, // the flashing-red last breath
    reserveRearmAt: 50, // refill past this to re-arm the reserve
    drownHpPerSec: 15, // HP lost per second while drowning at 0 air
    zoneMult: { sinkhole: 1.0, galleries: 1.0, maze: 1.1, throat: 1.25, abyss: 1.25 },
  },
  health: {
    max: 100, // base max HP
    regenDelay: 5, // seconds without damage before regen starts
    regenDuration: 4, // seconds for regen to refill from empty
    grabDamage: 35, // HP a Drowned grab costs
    guardianDamage: 70, // HP a Guardian hit costs
  },
  light: {
    batterySeconds: 300, // flashlight on-time per battery (seconds)
    dimBelow: 0.5, // battery fraction where dimming starts
    flickerBelow: 0.2, // battery fraction below which the lamp flickers
    beamAngleDeg: 84, // full cone; DESIGN said 60 but M3 shipped this look
    siltBeamAngleDeg: 25, // full cone during a silt-out (backscatter)
    siltThrowM: 22, // beam throw during a silt-out (vs 65 clear)
  },
  tilt: {
    driftDegPerSec: 15, // roll drift rate inside tilt zones (deg/s)
    decayDegPerSec: 2, // natural roll decay outside tilt zones (deg/s)
    relevelDegPerSec: 45, // auto re-level rate when breaking the surface (deg/s)
    wanderFreq: 0.07, // how fast the drift direction wanders (noise time scale)
    zoneMaxDeg: { galleries: 30, maze: 90, throat: 180 },
  },
  silt: {
    ambientVisM: 12, // visibility inside a stirred ambient-silt patch (m)
    ambientSettleSec: 20, // seconds for stirred ambient silt to settle
    stirSec: 2.5, // seconds of disturbance to fully stir a chamber
    stirSpeed: 2.5, // swimming faster than this near a silty floor stirs
    floorProximityM: 1.5, // "near the floor" for stirring
    siltoutVisM: 4, // visibility during a full silt-out (m)
    siltoutFadeSec: 75, // seconds for a silt-out to clear (column re-arms after)
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
    siltCloudRadiusM: 9, // radius of the camera-following silt particle cloud (m)
    depthDarkStart: 6, // ambient light starts fading below this depth (m)
    depthDarkEnd: 45, // fully dark by this depth
    depthDarkFloor: 0.12, // fraction of ambient that survives at full depth
  },
  chemlights: {
    startCount: 0, // they're a wall buy; debug grants for testing
    packSize: 10, // chemlights per purchased pack
    worldCap: 40, // oldest fade beyond this
    throwSpeed: 5, // toss speed (m/s)
    sinkAccel: 2.2, // they sink gently to the floor
    waterDrag: 0.6, // fraction of velocity lost per second
    lightRadiusM: 6, // pooled real lights on the nearest few
    lightPool: 6, // nearest N chemlights get real point lights
  },
  shifts: {
    // M14 (DESIGN §9): the shift clock is PURE TIME — kills change nothing
    shiftSec: 90, // seconds per shift; the bell rings on every change
    firstShiftDelaySec: 8, // grace before shift 1 after the dive starts
    capBase: 4, // mob cap at shift 1 (cap = base + perShift x N)
    capPerShift: 1.5, // mob-cap growth per shift
    hardCap: 24, // absolute alive ceiling (perf budget — LOD carries it)
    packMax: 5, // spawn events place 1..packMax as a loose pack
    emergeStaggerSec: 1.1, // seconds between pack members surfacing from the burrow
    spawnCooldownSec: 3.5, // pause between spawn events (population fills steadily)
  },
  zombies: {
    baseSpeed: 2.8, // Drowned swim speed at round 1 (m/s)
    speedPerRound: 0.12, // speed gained per round (m/s)
    speedCap: 5.5, // speed ceiling - always below player sprint (escapable, for air)
    baseHp: 150, // Drowned HP at round 1
    hpGrowth: 1.12, // HP multiplier per round through lateRound
    hpGrowthLate: 1.18, // HP multiplier per round after lateRound (the wall)
    lateRound: 20, // round where the HP curve steepens
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
    separationRadiusM: 0.95, // bodies shoulder each other apart inside this
    separationPush: 2.4, // how hard they jostle
    maxConcurrentAttackers: 3, // the rest crowd and wait their turn
    grabWindupJitterSec: 0.4, // extra random windup per attack (desyncs hits)
    stuckDespawnSec: 12, // no progress this long → burrow back down…
    stuckDespawnMinDistM: 8, // …but never vanish in front of the player
    // ── the grab (procedural handling, DESIGN §8.1) ──
    grabRangeM: 1.35, // distance a grab can land from (m)
    grabWindupSec: 0.55, // firm, unhurried reach before the grab lands
    grabCooldownSec: 1.9,
    grabShoveSpeed: 2.5, // velocity kick into the player
    grabTiltKickDeg: 22, // brief roll kick (the regulator rip)
    // ── death & corpses (go limp and drift, DESIGN §8.1) ──
    corpseDriftSec: 5.5, // seconds a corpse drifts before settling
    corpseFadeSec: 2.0, // seconds a settled corpse takes to fade out
    // ── M14 the living cave (DESIGN §9): far bodies WANDER the graph ──
    wanderSpeedFactor: 0.45, // wander drift speed as a fraction of chase speed
    aggroM: 25, // inside this, a wanderer turns hunter regardless of sight
    aggroLosM: 38, // inside this WITH line of sight, it turns hunter
    deaggroM: 48, // a hunter farther than this for deaggroSec goes back to wandering
    deaggroSec: 6, // seconds beyond deaggroM before the hunt is dropped
    wanderTargetTimeoutSec: 45, // give up on an unreached wander target
    despawnCheckSec: 4, // minecraft-style despawn roll cadence (far + unseen only)
    despawnChance: 0.12, // chance per roll to slip below and respawn elsewhere
    despawnMinDistM: 42, // never despawn nearer than this (and never in sight)
    lodDistM: 40, // beyond this (and unseen): reduced animation + no separation
    // ── workstation-pause idle (LORE §4: remembering a task) ──
    pauseChance: 0.25, // chance to pause when drifting past an old station
    pauseSec: 3.0, // workstation-pause length (the crew remembers a task)
    pauseNearM: 3.5, // pause only within this range of an old workstation
    pauseCooldownSec: 20, // per-zombie, so nobody loops the same desk
  },
  roster: {
    // ── M14.5 the Roster of 41 (DESIGN §8.6): every Drowned is a PERSON.
    // Per-man identity data lives in zombies/roster.ts (the crew book);
    // these are the generic knobs the book derives from. ──
    statVariance: 0.15, // per-man speed/HP multipliers stay within ±this
    voiceRateMin: 0.78, // deepest per-man moan pitch (playback rate)
    voiceRateMax: 1.22, // highest per-man moan pitch
    // watch-bill weights: BALANCE lives here, never in sometimes-having-it —
    // a carrier always carries and always drops; scarcity = he walks less
    weightDryCell: 0.35, // the lamps-man's share of the watch bill (others: 1)
    weightAmmo: 0.3, // the stores-man's share
    weightSlug: 0.12, // the pile watch's share (his slug is the rare echo)
    pauserChanceMult: 4, // workstation-pauser quirk: pauseChance multiplier
    runnerSpeedBonus: 1.1, // runner quirk: extra speed on top of his mult
    lingerExtraSec: 5, // lingerer quirk: extra seconds standing at the burrow mouth
    barrowLineAfterWatch: 3, // Lowe's "Barrow, was it" unlocks after Barrow's Nth watch
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
      vortexPullSpeed: 9, // how fast caught bodies are dragged to the point (m/s)
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
      cooldownSec: 0.85, // seconds between knife swings
    },
  },
  perks: {
    // DESIGN §10.5 — pick 4 of 9. Costs + effect numbers.
    cap: 4, // perks you can hold at once (the identity limit)
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
    damageMult: 2.5, // benched-weapon damage multiplier
    magMult: 1.5, // benched magazine-size multiplier
    reserveMult: 1.5, // benched reserve-ammo multiplier
    benchSec: 3.0, // the machine works the weapon
    takeSec: 10.0, // seconds the Bench works before handing it back
    impactLightIntensity: 14, // the glow a papped shot leaves at impact
    impactLightSec: 0.35, // papped impact-light lifetime (the universal rule: light)
    impactLightRadiusM: 9, // papped impact-light radius (m)
  },
  drops: {
    // §10.7: ~2% + pity. Weights are relative draw odds.
    chance: 0.02, // drop chance per kill (pity timer forces one eventually)
    pityKills: 40, // a drop is guaranteed within this many kills
    despawnSec: 30, // seconds a world drop floats before sinking away
    pickupRadiusM: 1.6, // swim-over pickup radius (m)
    doublePointsSec: 60, // Double Points duration (s)
    instaKillSec: 30, // Insta-Kill duration (s)
    clearWatersSec: 30, // Clear Waters vis-boost duration (s)
    clearWatersVisMult: 1.15, // visibility multiplier while Clear Waters runs
    pressureWaveAward: 400, // flat points for the room-clear (BO1 nuke custom)
    weights: { maxAmmo: 22, doublePoints: 22, instaKill: 22, clearWaters: 14, batterySurge: 14, pressureWave: 6 },
  },
  specials: {
    // The Angler (DESIGN §8.2, M15 rework): patrol → freeze-on-sight →
    // vortex inhale. It never does HP damage — it costs air, position, and
    // certainty. ONE alive at a time; always drops a battery.
    angler: {
      fromRound: 8, // Anglers may spawn from this shift
      spawnChanceAtRoundStart: 0.5, // if none alive; it patrols the MAZE
      minSpawnDistM: 25, // min spawn distance from the player (m)
      hp: 600,
      patrolSpeed: 1.5, // slow maze patrol, lure lit (m/s)
      seeM: 26, // LOS inside this = it notices you and goes PERFECTLY STILL
      unseeSec: 4, // frozen + unseen this long = it resumes the patrol
      vortexTriggerM: 5, // approach the stationary light this close = the inhale
      inhaleSec: 0.7, // you are dragged into the mouth over this
      carrySpeed: 6.5, // carried through real tunnels at this speed (m/s)
      carryMaxSec: 5, // released no later than this into the carry
      carryMinHops: 2, // destination at least this many rooms away
      approachSpeed: 3.4, // provoked (shot at range): deliberate closing speed — never outswims a sprint
      leaveSpeed: 2.6, // swimming away after an attack
      despawnOutOfSightM: 24, // leaving + unseen beyond this = despawns
      arcBonusMult: 2.5, // the Arc Projector is its counter (DESIGN §8.2)
      slugDropChance: 0.25, // rare output-slug echo on kill (deferred from M13a)
      killPoints: 200,
      lureBobAmp: 0.35, // patrol-only bob — frozen it is DEAD still (the Lamp Man lie)
    },
    // The Lamp Man (DESIGN §8.5): a placed dread object — no AI, no pathing.
    lampman: {
      everyShifts: 7, // spawns/relocates on shifts divisible by this
      seenM: 24, // within this + LOS + looking toward him = SEEN
      seenFacingDeg: 28, // "looking toward him" half-angle (deg)
      leaveM: 34, // after being seen: farther than this...
      leaveSec: 5, // ...for this long = he is quietly gone
      scareM: 3.2, // too close = the jumpscare (reserve breath, max HR)
      scareShakeSec: 0.7, // decaying roll-whip after the randomization
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
      patrolSpeed: 1.3, // post-orbit patrol speed (m/s)
      aggroSpeed: 4.8, // pursuit speed once aggroed (m/s)
      damage: 60, // the heavy hit
      hitShove: 5, // shove impulse of a Guardian hit (m/s)
      hitAirLoss: 6, // air ripped away by a Guardian hit
      proximityAggroM: 4, // tier 1: you brushed the post
      lightAggroM: 14, // tier 2: your lamp at range
      sprintLightAggroM: 22, // tier 3: loud AND lit
      calmSec: 6, // loses you, walks back
      leashM: 32, // how far past its post a Guardian pursues (m)
      attackRangeM: 2.2, // reach of the heavy hit (m)
      attackWindupSec: 0.7, // slow inevitable windup before the hit (s)
      killPoints: 500,
    },
    biolum: { count: 900, sizeM: 0.06 }, // the Cathedral's own faint light
  },
  ascent: {
    // Grab the Heart → the site objects, all the way up (DESIGN §11).
    grabHoldSec: 1.5, // hold-E seconds to lift the Heart
    zombieSpeedCapMult: 0.76, // ascent zombies stay outswimmable
    spawnEverySec: 3.5, // global pressure, alive cap still rules
    visMult: 0.75, // one grade darker on the way out
    heartLightIntensity: 9, // the carried glow - you can see, and be seen
    heartLightRadiusM: 13, // carried-glow radius (m)
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
    bulbBelowCeilingM: 0.4, // string-light bulbs hang this far under the ceiling (m)
  },
  economy: {
    startPoints: 500, // points at run start
    hit: 10, // points per bullet hit
    kill: 60, // points per body kill
    headshotKill: 100, // points per headshot kill
    meleeKill: 130, // points per melee kill
    boxCost: 950, // Requisition Roulette spin price
    papCost: 5000, // the Bench price
    papAmmo: 4500, // PaP ammo refill price
    batteryCost: 250, // battery vend price
    chemlightPackCost: 250, // chemlight 10-pack price
    reelCost: 750, // extra guide-reel price
    // wall-gun price sheet (DESIGN §10.1); ammo refill = half gun cost
    gunCost: { speargun: 500, pneuDriver: 1000, flechette: 1250, harpoon: 1500, lineLance: 1750 },
  },
  voice: {
    // ── Lowe + tapes (LORE §2.1/§5 anti-spam; silence is the default) ──
    ambientChance: 0.4, // ambient lines roll this even when off cooldown
    ambientCooldownSec: 120, // global gap between ambient lines
    surfacedDelaySec: 3, // Lowe speaks only after this long FULLY out of water (user 2026-07-20 — bobbing for air doesn't count)
    idleAfterSec: 45, // platform stillness before an idle line may roll
    closeCallAir: 15, // surfacing under this air = a close-call event
    voGain: 0.9, // fallback-squelch level rides volumeVo too
    jukeboxGain: 0.22, // the song is far away, everywhere (LORE §6)
    shimmerRefDistM: 2.2, // toy music-box shimmer ≈ audible ≤8 m
    // ── M12 in-head doctrine (LORE §2.1 v3): lines play anywhere ──
    swimAmbientOfferSec: 100, // a submerged Lowe musing is OFFERED this often (roll + cooldown still decide)
    silenceLineSec: 300, // total quiet (no dialog, no music) before rem.silence.1 may roll
    heartNearM: 15, // Lowe feels the warmth inside this range (heart.near.1)
    heartCarryDelaySec: 30, // seconds into the Ascent before heart.carry.1 may play
    moonlightDepthM: 50, // carrying the Heart shallower than this + no song → Moonlight starts
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
    anglerRefDistM: 5, // distance where the lure hum is at half power (m)
    guardianRefDistM: 8, // distance where the presence is at half power (m)
    whumpRefDistM: 12, // a silt-out is a big event — carries far
    geigerRangeM: 14, // crackle radius around the Pile (flavor only)
    ambienceGain: 0.35, // depth-bed loops (shallow/mid/deep crossfade) level
    emitterGain: 0.8, // audio-node loops (machinery/airflow behind walls) pre-positional level
    musicLowpassHz: 1100, // music bus underwater tone (never ducks; open air = full bright)
    lullAfterSec: 240, // this long with NO dialog AND NO music → the lull track may play (M12: true silence, not just no dialog)
    lullCooldownSec: 600, // minimum gap between lull plays
    lullGain: 0.5, // lull track level on the music bus
    // ── M12 voice chains (in-head Lowe, robotic REMORA) ──
    headVoiceLowpassHz: 4800, // Lowe's inner-voice warmth (dry, close, no room)
    headDoubleGain: 0.16, // the whisper-quiet 28 ms double under his lines
    remoraBandLowHz: 320, // REMORA telephone band floor
    remoraBandHighHz: 3300, // REMORA telephone band ceiling
    remoraRingHz: 52, // ring-mod tremolo rate — the "machine" in her voice
    remoraRingDepth: 0.3, // tremolo depth 0..1 (higher = more robotic)
    bellGain: 0.8, // the shift bell (one toll per shift; five at the hatch)
    moonlightGain: 0.45, // Moonlight at the Waterline on the ascent (louder than jukebox-far — this one is FOR you)
  },
  guideLine: {
    reelLengthM: 200, // meters of line on a fresh reel
    maxDeployedM: 400, // max total line deployed in the world (m)
    followSpeed: 3.5, // hand-over-hand glide speed on the line (m/s)
    grabRadiusM: 1.5, // how close a strand must be to grab/ride it (m)
    tapHoldSeconds: 0.3, // T/X shorter than this = tap, longer = hold action
    anchorReachM: 2.0, // starting a line auto-anchors to rock within this
    pointSpacingM: 1.0, // line vertices laid this far apart while paying out
    reelInRadiusM: 2.2, // reeling collects points inside this
    followPullPerSec: 3, // how hard follow/reel pulls you onto the line
  },
} as const;

// ── tuning overrides, two layers (user 2026-07-19 + save-to-disk 2026-07-20) ──
//  1. tuning.overrides.json — COMMITTED values written by the panels' SAVE
//     button (via /__tuning). Applied before defaults are captured, so they
//     ARE the stock values: saved numbers read as untuned everywhere.
//  2. localStorage — the live scratch layer; carries editor ⇄ playtest.

import FILE_OVERRIDES_JSON from './tuning.overrides.json';

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

/** The committed disk layer (panel SAVE merges into this). */
export function diskTuningOverrides(): Record<string, number> {
  return { ...(FILE_OVERRIDES_JSON as Record<string, number>) };
}

/** After a successful SAVE: current values become the new stock — rows read
 *  clean, the localStorage scratch layer resets. */
export function bakeTuningDefaults(): void {
  for (const p of listTuningPaths()) DEFAULTS[p] = getTuningValue(p);
  try {
    localStorage.removeItem(OVERRIDE_KEY);
  } catch {
    // ignore
  }
}

// disk overrides first (they are stock), THEN capture defaults, THEN the
// localStorage scratch layer on top
for (const [p, v] of Object.entries(FILE_OVERRIDES_JSON as Record<string, number>)) {
  if (typeof v === 'number') {
    const l = leafAt(p);
    if (l && typeof l.obj[l.key] === 'number') l.obj[l.key] = v;
  }
}
for (const p of listTuningPaths()) DEFAULTS[p] = getTuningValue(p);
for (const [p, v] of Object.entries(loadOverrides())) {
  if (typeof v === 'number') {
    const l = leafAt(p);
    if (l && typeof l.obj[l.key] === 'number') l.obj[l.key] = v;
  }
}
