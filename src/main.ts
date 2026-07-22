import * as THREE from 'three';
import './style.css';
import { DebugPanel } from './debug/panel';
import { buildTuningUI } from './debug/tuningPanel';
import { NODES, buildAirWaterMap, buildFalseUpMap, getNode, waterSurfaceLevel, type Zone } from './cave/data';
import { buildWaterSurfaces } from './cave/waterViz';
import { gradient, initSdf, regionAt, resolveCollision, sdf } from './cave/sdf';
import { buildCaveMesh } from './cave/mesh';
import { buildDoors, openAllDoors, openDoor } from './cave/doors';
import { buildMounds, columnDistSq, placeMounds, syncMounds } from './cave/mounds';
import { PlayerController } from './player/controller';
import { sampleCurrent, setCurrentOverride } from './player/current';
import { pullAt, Undertow } from './player/undertow';
import { lightFactor, Vitals } from './player/vitals';
import { Bubbles } from './player/bubbles';
import { TiltSystem, buildTiltRegions } from './player/tilt';
import { GuideLine } from './player/line';
import { LineRender } from './player/lineRender';
import { Chemlights } from './player/chemlights';
import { ChemlightRender } from './player/chemlightRender';
import { Atmosphere } from './effects/atmosphere';
import { SiltSystem, chambersFromNodes } from './effects/silt';
import { SiltParticles } from './effects/siltParticles';
import { RoundSystem } from './zombies/rounds';
import { ZombieManager } from './zombies/zombies';
import { CARRY_DROP, CREW } from './zombies/roster';
import { SpecialManager } from './zombies/specials';
import { HeartRun, photographDataUrl } from './game/heart';
import { wallSpot, orientToWall } from './economy/shops';
import { Weapons, TracerFx, ImpactGlow, WALL_GUNS, BOX_GUNS, type WeaponSlot, type GunId } from './player/weapons';
import { ViewModel } from './player/viewmodel';
import { Points } from './economy/points';
import { Perks, ALL_PERKS } from './economy/perks';
import { InteractSystem } from './economy/interact';
import { Shops } from './economy/shops';
import { MysteryBox } from './economy/mysteryBox';
import { PapBench } from './economy/pap';
import { Drops, type DropId } from './economy/drops';
import { Inventory } from './economy/inventory';
import { buildPickups } from './economy/pickups';
import { AudioDirector } from './audio/director';
import { SAMPLES } from './audio/samples';
import { loadManifest, VoicePlayer, VoiceQueue, type VoManifest } from './audio/voice';
import { MUSIC } from './audio/music';
import { arbitrate } from './audio/speech';
import { REMORA_LINES, TAPES } from './audio/lines';
import { TapeDeck, TapeProps } from './game/tapes';
import { Toys } from './game/toys';
import { loadImageManifest, toyPhotoDataUrl } from './game/media';
import { GALLERY } from './game/gallery';
import { buildPosters } from './game/posters';
import { Annex } from './game/annex';
import { buildCamp } from './game/camp';
import { Hud } from './ui/hud';
import { Menus } from './ui/menus';
import { SETTINGS, saveSettings } from './ui/settings';
import { TUNING } from './tuning';

const params = new URLSearchParams(location.search);

if (params.get('view') === 'map') {
  void import('./viewer/map').then((m) => m.initMapViewer());
} else if (params.has('edit')) {
  void import('./editor/editor').then((m) => m.initEditor());
} else {
  initGame();
}

function initGame(): void {
  const WATER_Y = -1.5;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 300);
  scene.add(camera);
  const headlampBase = 90;
  const headlamp = new THREE.SpotLight(
    0xcfe0d4,
    headlampBase,
    65,
    THREE.MathUtils.degToRad(TUNING.light.beamAngleDeg / 2),
    0.65,
    2,
  );
  headlamp.position.set(0, 0, 0);
  headlamp.target.position.set(0, 0, -1);
  camera.add(headlamp, headlamp.target);

  // ── cave ──
  initSdf();
  const { mesh: caveMesh, tris, genMs } = buildCaveMesh();
  scene.add(caveMesh);
  const doors = buildDoors(scene);
  const moundSpots = placeMounds();
  const moundVisuals = buildMounds(scene, moundSpots);

  // ── lights & water ──
  const ambient = new THREE.AmbientLight(0x3a4a50, 0.5);
  scene.add(ambient);
  const sun = new THREE.PointLight(0xfff2d6, 700, 85, 2);
  sun.position.set(0, 18, 0);
  scene.add(sun);
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x2a5a66,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    roughness: 0.25,
    metalness: 0.1,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(52, 52), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_Y;
  scene.add(water);

  // Air/water model (user rework 2026-07-18): every air region carries its own
  // local water surface in data; the lookup is by SDF region, so air exists
  // only where the geometry actually traps a bubble — no more water floating
  // beside air with nothing in between.
  const airWater = buildAirWaterMap();
  const falseUps = buildFalseUpMap();
  const waterLevelAt = (x: number, y: number, z: number): number | null => {
    if (Math.hypot(x, z) < 18 && y > -16) return WATER_Y; // open cenote water
    const ref = regionAt(x, y, z)?.ref;
    const ws = ref !== undefined ? airWater.get(ref) : undefined;
    // room pools tilt with falseUp, tunnel air gaps follow the passage
    // ceiling, all-air regions report a bottomless level (user 2026-07-19)
    return ws ? waterSurfaceLevel(ws, x, y, z) : null;
  };
  // local water surfaces (room pools, air-gap ribbons, plunge discs) — the
  // exact same meshes the level editor previews (src/cave/waterViz.ts)
  scene.add(buildWaterSurfaces(waterMat));

  // ── atmosphere & silt (M4) ──
  const fog = new THREE.FogExp2(0x062226, 0.035);
  scene.fog = fog;
  const atmo = new Atmosphere(scene, fog, ambient, headlamp);
  const silt = new SiltSystem(chambersFromNodes(NODES));
  const siltFx = new SiltParticles(scene);

  // ── keep the browser's hands off the game keys (user report 2026-07-19:
  // Ctrl is wall-grab, W is swim — Ctrl+W closed the tab mid-dive!) ──
  //  layer 1: fullscreen + Keyboard Lock on play → Chromium delivers
  //           Ctrl+W / Ctrl+R / Ctrl+T to the game instead of acting on them
  //  layer 2: once a dive has started, closing the tab asks first
  // ── audio (M8a): the director owns every sound; the context wakes on the
  // same first click that enters fullscreen (autoplay policy) ──
  const pileNode = NODES.find((n) => n.tags.includes('power'));
  const audio = new AudioDirector(pileNode ? [...pileNode.pos] : null);
  void SAMPLES.init(); // generated-SFX manifest (absent → all-synth)

  const kb = (navigator as { keyboard?: { lock?: (keys?: string[]) => Promise<void> } }).keyboard;
  let played = false;
  const engagePlay = (): void => {
    played = true;
    audio.ensure();
    if (SETTINGS.fullscreenOnPlay && !document.fullscreenElement) {
      document.documentElement
        .requestFullscreen()
        .then(() => kb?.lock?.(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'KeyT', 'KeyX', 'KeyF', 'KeyC', 'KeyG', 'KeyN', 'KeyP', 'KeyH', 'KeyV', 'KeyB', 'Digit1', 'Digit2', 'Digit3', 'Space']))
        .catch(() => {});
    }
    renderer.domElement.requestPointerLock();
  };
  renderer.domElement.addEventListener('click', engagePlay);
  window.addEventListener('beforeunload', (e) => {
    // accidental close → confirm (never during an editor playtest round-trip)
    if (played && !vitals.dead && !params.has('playtest')) e.preventDefault();
  });

  // ── player ──
  const debug = new DebugPanel(params.has('debug'));
  const player = new PlayerController(camera, renderer.domElement);
  const vitals = new Vitals();
  player.onLunge = () => vitals.onLunge();
  const bubbles = new Bubbles();
  scene.add(bubbles.points);
  const tilt = new TiltSystem(buildTiltRegions());
  const guideLine = new GuideLine();
  const lineFx = new LineRender(scene, guideLine);
  const chems = new Chemlights();
  const chemFx = new ChemlightRender(scene, chems);
  const hudLayer = document.getElementById('hud');
  const dbgLayer = document.getElementById('dbg');
  if (!hudLayer || !dbgLayer) throw new Error('#hud / #dbg missing');
  const hud = new Hud(hudLayer);

  // ── zombies, rounds, combat (M5) ──
  const points = new Points();
  points.onChange = (balance, delta) => {
    hud.setPoints(balance);
    hud.pointsTick(delta);
  };
  const rounds = new RoundSystem();
  const doorByEdge = new Map(doors.map((d) => [d.edge, d]));
  const zombies = new ZombieManager(
    scene,
    rounds,
    (e) => {
      const d = doorByEdge.get(e);
      return d ? d.open : true; // no door on the edge = always passable
    },
    (x, y, z) => waterLevelAt(x, y, z),
    (ref) => falseUps.get(ref),
  );
  const weapons = new Weapons();
  const tracers = new TracerFx(scene);
  const viewModel = new ViewModel(camera);
  weapons.bindMouse(renderer.domElement, () => !vitals.dead && player.mode !== 'noclip');
  const E = TUNING.economy;

  // ── the economy (M6a; M13 free-issue rework — the site issues, it does
  // not sell; the belt carries what opens the way down) ──
  const perks = new Perks();
  const interact = new InteractSystem();
  const inventory = new Inventory();
  inventory.onChange = () => hud.setBelt(inventory.dynamite, [...inventory.keys.values()], inventory.slugs);
  // the Abyss hatch's toll (DESIGN §10.3): free to crank — the site charges
  // TIME. Five bells ring out, the shift counter rolls up five, and the
  // director's horn is synced away so the bells own the moment.
  const hatchToll = (): void => {
    const n = rounds.round + 5;
    audio.syncRound(n);
    rounds.startRound(n);
    const e = audio.engine;
    if (e && e.running) void import('./audio/sfx').then((s) => s.bellSequence(e.ctx, e.master));
    voice.request('bell.2');
    remora.request('rem.hatch.1');
    hud.toast('THE SITE CHARGES TIME — FIVE BELLS');
  };
  const applyPerkEffects = (): void => {
    const m = perks.mods;
    vitals.mods = m;
    weapons.maxSlots = m.slots;
    player.speedMult = m.speedMult;
    tilt.decayMult = m.tiltDecayMult;
    atmo.beamMult = m.beamWidenMult;
    hud.setPerks(perks.owned);
  };
  const shops = new Shops({
    scene,
    interact,
    doors,
    inventory,
    bell: () => rounds.round,
    perks,
    weapons,
    toast: (msg) => hud.toast(msg),
    click: (ok) => audio.buy(ok),
    onHatchToll: hatchToll,
    onPerkBought: (id) => {
      applyPerkEffects();
      run.draughts++;
      audio.perkBought();
      if (id === 'barnacleHide') vitals.hp = perks.mods.maxHp; // the dose heals whole
    },
    onVendor: (v) => {
      if (v === 'battery') {
        vitals.battery = 1;
        return true;
      }
      if (v === 'chemlights') {
        chems.count += TUNING.chemlights.packSize;
        return true;
      }
      if (guideLine.reelM >= TUNING.guideLine.maxDeployedM) return false; // 400 m cap
      guideLine.reelM = Math.min(guideLine.reelM + TUNING.guideLine.reelLengthM, TUNING.guideLine.maxDeployedM);
      return true;
    },
    onPowerOn: () => {
      pap.setPowered(true);
      audio.powerOn();
      voice.request('power.1'); // "next surfacing" — the queue holds it
      flashStatus('power on — the arteries are lit');
    },
  });

  // ── M6b: the Requisition Roulette, the Bench, drops (M13: free pull per
  // bell; the Bench eats a found fuel slug per upgrade) ──
  const box = new MysteryBox(scene, interact, () => rounds.round, weapons, (m) => hud.toast(m));
  const pap = new PapBench(scene, interact, inventory, weapons, () => shops.powered, (m) => hud.toast(m));
  buildPickups(scene, interact, inventory, (m) => hud.toast(m));
  const impactGlow = new ImpactGlow(scene);
  const drops = new Drops({
    scene,
    // every drop toast IS a drop event — the chime rides along
    toast: (m) => {
      hud.toast(m);
      audio.drop();
    },
    applyMaxAmmo: () => weapons.refillAll(),
    applyBatterySurge: () => (vitals.battery = 1),
    applyPressureWave: () => {
      const killed = zombies.killAll();
      points.award(TUNING.drops.pressureWaveAward);
      flashStatus(`pressure wave — ${killed} recovered`);
    },
    applyClearWaters: () => silt.clearAll(),
    applySlug: () => inventory.addSlug(),
    setPointsMultiplier: (m) => (points.multiplier = m),
  });

  // ── M7: the specials, the Heart, the Ascent, the ledger ──
  const takeSpecialHit = (damage: number, fromDir: THREE.Vector3, airLoss: number): void => {
    audio.grab();
    vitals.damage(damage);
    if (airLoss > 0 && !vitals.god && !vitals.infiniteAir) vitals.air = Math.max(0, vitals.air - airLoss);
    hud.damageFlash();
    player.vel.addScaledVector(fromDir, 3.5);
  };
  // M15: the Lamp Man's whip + the vortex shake share one control block
  const scare = { t: 0, tiltSafe: false };
  const clampRoll = (deg: number): number => Math.max(-SETTINGS.maxTiltDeg, Math.min(SETTINGS.maxTiltDeg, deg));
  const doLampScare = (): void => {
    audio.lampScare();
    vitals.panic(true); // reserve breath at max heart rate
    hud.damageFlash();
    // the whip: rotation + tilt randomized DURING the vanish, so his
    // disappearance is never witnessed (DESIGN §8.5 rule 2)
    player.look(Math.random() * 360, (Math.random() * 2 - 1) * 55);
    if (!scare.tiltSafe) player.setRollDeg(clampRoll((Math.random() * 2 - 1) * 180));
    scare.t = TUNING.specials.lampman.scareShakeSec;
  };
  const specials = new SpecialManager(
    scene,
    silt,
    {
      toast: (m) => hud.toast(m),
      award: (n) => points.award(n),
      dropBattery: (pos) => drops.spawn('batterySurge', pos),
      dropSlug: (pos) => drops.spawn('fuelSlug', pos),
      onVortex: (phase, point) => {
        if (phase === 'grab') {
          audio.vortexStart();
          vitals.panic(false); // max HR — the price is air, never HP
        } else if (phase === 'carry' && point) {
          camera.position.copy(point);
          player.vel.set(0, 0, 0);
          if (!scare.tiltSafe) player.setRollDeg(clampRoll(player.measuredRollDeg + (Math.random() * 2 - 1) * 3));
        } else if (phase === 'release') {
          audio.vortexEnd();
        }
      },
      onLampSeen: () => {
        voice.request('lamp.1');
        remora.request('rem.lamp.1');
      },
      onLampScare: () => doLampScare(),
    },
    (e) => {
      const d = doorByEdge.get(e);
      return d ? d.open : true;
    },
  );
  const run = { timeSec: 0, draughts: 0, ascentSpawnT: 0 };
  // ── M15.5 the Undertow (DESIGN §11.1): armed the moment the Heart lifts;
  // the override lives in the shared current sampler, so the player, motes,
  // silt, and corpses all visibly inhale together — the honest tell ──
  const undertow = new Undertow();
  const undertowPull = new THREE.Vector3();
  let undertowEnv = 0;
  setCurrentOverride((x, y, z, out) => {
    if (undertowEnv <= 0 || !undertow.field) return 0;
    const dir = pullAt(undertow.field, x, y, z);
    if (!dir) return 0;
    const s = TUNING.undertow.strength;
    out.x = dir[0] * s;
    out.y = dir[1] * s;
    out.z = dir[2] * s;
    return undertowEnv;
  });
  const heart = new HeartRun(scene, interact, camera, {
    toast: (m) => hud.toast(m),
    onFirstGrab: () => {
      rounds.paused = true; // the Ascent supersedes the shift bell
      zombies.ascentSpeedCap = TUNING.zombies.speedCap * TUNING.ascent.zombieSpeedCapMult;
      hud.setAscent(true);
      hud.toast('ASCEND.');
      flashStatus('THE ASCENT — get to the surface');
      // the cave notices the theft: the flow field home is computed ONCE,
      // against the doors as they stand right now
      const home = NODES.find((n) => n.tags.includes('heart'));
      if (home) undertow.arm(home.id, (e) => {
        const d = doorByEdge.get(e);
        return d ? d.open : true;
      });
    },
  });
  const runStats = () => ({
    recovered: zombies.recovered,
    rounds: rounds.round,
    timeSec: run.timeSec,
    draughts: run.draughts,
  });
  // G13: the photograph, pinned at the drill head (LORE §7 — the print IS
  // the fallback art; the date is the wrongness)
  {
    const dh = NODES.find((n) => n.id === 'drill-head');
    if (dh) {
      const spot = wallSpot(dh);
      const frame = new THREE.Group();
      const backing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.04), new THREE.MeshStandardMaterial({ color: 0x3a3a30, roughness: 0.8 }));
      frame.add(backing);
      const printTex = new THREE.TextureLoader().load(photographDataUrl());
      printTex.colorSpace = THREE.SRGBColorSpace;
      const print = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.33), new THREE.MeshBasicMaterial({ map: printTex }));
      print.position.z = 0.025;
      frame.add(print);
      orientToWall(frame, spot);
      scene.add(frame);
      interact.add({
        id: 'photo-g13',
        pos: [spot.pos.x, spot.pos.y, spot.pos.z],
        prompt: () => ({ text: hud.inspectOpen ? 'PUT IT BACK' : 'THE PHOTOGRAPH', holdSec: 0, enabled: true }),
        execute: () => {
          if (hud.inspectOpen) hud.closeInspect();
          else {
            hud.showInspect(photographDataUrl(), 'B-DECK — DRILL HEAD — MARCH 1971');
            GALLERY.unlock({ id: 'photo-g13', title: 'THE PHOTOGRAPH', url: photographDataUrl(), caption: 'B-DECK — DRILL HEAD — MARCH 1971' });
          }
        },
      });
    }
  }

  // ── M8b: Lowe's voice, the tapes, the toys (LORE §2/§5/§6) ──
  let voManifest: VoManifest | null = null;
  void loadManifest().then((m) => (voManifest = m));
  const voice = new VoiceQueue();
  const voicePlayer = new VoicePlayer(() => audio.engine, () => voManifest);
  voicePlayer.onEnded = () => voice.setSpeakSeconds(0);
  // The REMORA unit (user 2026-07-20, LORE §2.4): the client-supplied dive
  // monitor. Speaks only UNDERWATER (Lowe's exact complement), through the
  // helmet speaker (master — the water never touches it). Same anti-spam
  // queue rules as Lowe: silence is still the default.
  const remora = new VoiceQueue(REMORA_LINES);
  const remoraPlayer = new VoicePlayer(() => audio.engine, () => voManifest, 'remora');
  remoraPlayer.onEnded = () => remora.setSpeakSeconds(0);

  // ── M12: ONE SONG — the real track factory behind the MusicDirector.
  // Every song (jukebox/lull/Moonlight) builds here: element → gain →
  // engine.music. Null in offline harness contexts (no media elements). ──
  MUSIC.wire((url, gain, loop, onEnded) => {
    const e = audio.engine;
    if (!e || !e.running) return null;
    const ctx = e.ctx as AudioContext;
    if (typeof ctx.createMediaElementSource !== 'function') return null;
    const el = new Audio(url);
    el.loop = loop;
    const src = ctx.createMediaElementSource(el);
    const g = ctx.createGain();
    g.gain.value = gain * SETTINGS.volumeMusic;
    src.connect(g);
    g.connect(e.music);
    el.addEventListener('ended', onEnded);
    void el.play().catch(() => {});
    return {
      stop: () => {
        el.pause();
        try {
          src.disconnect();
        } catch {
          // context already gone
        }
      },
    };
  });
  MUSIC.lullCooldown = 150; // opening grace: no lull in the first minutes
  const deck = new TapeDeck();
  const tapeProps = new TapeProps(scene, interact, deck, () => audio.engine, () => voManifest, (m) => hud.toast(m));
  deck.onFinished = (tape) => {
    tapeProps.stopAudio();
    voice.request(tape.reactionId); // queued; plays while he's still surfaced
  };
  const toys = new Toys(scene, interact, () => audio.engine);
  // ── M16: the Museum Annex (DESIGN §12.1) — exhibits mirror the run;
  // the morale button rides the ONE music slot like everything else ──
  const annex = new Annex(scene, interact, {
    tapesCollected: () => [...deck.collected],
    toysWound: () => toys.wound,
    perksOwned: (id) => perks.owned.has(id),
    gunOwned: (id) => weapons.owns(id),
    onParty: (on) => {
      // no loop (user 2026-07-21): when the record ends, the party ends —
      // annex.update sees the slot empty and stops the lights itself
      if (on) MUSIC.play('party', '/music/morale-night.mp3', TUNING.audio.partyGain, { loop: false, name: 'Morale Night' });
      else MUSIC.stop('party');
    },
    onFirstEntry: () => {
      voice.request('museum.1');
      remora.request('rem.museum.1'); // she'll say it next time he's under
    },
    toast: (m) => hud.toast(m),
  });
  // ── M8c: posters/labels in-world + the menus ──
  buildPosters(scene, interact, hud);
  buildCamp(scene); // M16.5: Lowe's shore camp (user: "starting room should look very nice")
  const applyDisplay = (): void => {
    renderer.domElement.style.filter = `brightness(${SETTINGS.brightness})`;
  };
  applyDisplay();
  const menus = new Menus({
    engage: engagePlay,
    restart: () => location.reload(),
    replayTape: (id) => {
      const t = TAPES.find((t) => t.id === id);
      if (t) deck.pending.push(t); // plays via the normal deck path
    },
    collectedTapes: () => [...deck.collected],
    setDucked: (on) => audio.engine?.setMasterVolume(SETTINGS.volumeMaster * (on ? 0.25 : 1)),
    applyDisplay,
  });
  // title at startup (playtest goes straight in); art waits for the manifest
  void loadImageManifest().then(() => {
    if (!params.has('playtest')) menus.show('title');
  });
  document.addEventListener('pointerlockchange', () => {
    // Esc during play = pause. Death/win keep their own screens. H's
    // deliberate mouse-free (debug panel) is not a pause.
    if (document.pointerLockElement === null && played && !vitals.dead && !heart.won && !menus.blocking && !params.has('playtest') && !ctl.dbgMouseFree) {
      menus.onUnlock();
    }
  });
  toys.onWind = (n) => {
    voice.request(`toy.${n}`);
    if (n < 3) hud.toast(`THE DIVER WINDS — ${n} OF 3`);
  };
  toys.onJukebox = () => {
    voice.request('jukebox.1');
    hud.toast('SOMEWHERE ABOVE, THE REC ROOM WAKES');
  };
  toys.onTrack = (name) => hud.toast(`NOW PLAYING — ${name.toUpperCase()}`);
  // one line of a set, chosen among the unsaid (rotation per LORE §2.2)
  const requestOneOf = (ids: string[]): void => {
    const fresh = ids.filter((id) => !voice.played.has(id));
    if (fresh.length > 0) voice.request(fresh[Math.floor(Math.random() * fresh.length)]);
  };
  // "…You again. Barrow, was it. Third time this week." — surface.5 joins
  // the rotation only once Barrow has actually walked that many watches
  // (M14.5: the line points at a real recurring man now)
  const surfacingPool = (): string[] =>
    zombies.roster.timesOnWatch('Barrow') >= TUNING.roster.barrowLineAfterWatch
      ? ['surface.1', 'surface.2', 'surface.3', 'surface.4', 'surface.5']
      : ['surface.1', 'surface.2', 'surface.3', 'surface.4'];
  debug.hotkey('KeyB', 'Skip tape', () => {
    if (deck.skip()) hud.toast('TAPE STOPPED — FILED');
  });

  // Second Wind (§10.5): blackout → wake at the last-used air pocket with the
  // sidearm → the perk is spent. Non-stackable, re-buyable.
  let lastPocketNodeId = 'sink-platform';
  const revive = { active: false, t: 0 };

  const checkMounds = (ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, dist: number): void => {
    // darts burst chalk columns (§7.2 shot detonation)
    for (let t = 0.6; t < dist; t += 0.35) {
      const px = ox + dx * t;
      const py = oy + dy * t;
      const pz = oz + dz * t;
      for (const m of moundSpots) {
        if (columnDistSq(m, px, py, pz) < 0.9 && silt.detonate(m.nodeId)) {
          audio.siltOut(getNode(m.nodeId).pos);
          flashStatus(`chalk column shot — ${m.nodeId}`);
          return;
        }
      }
    }
  };
  const shotDir = new THREE.Vector3();
  const muzzle = new THREE.Vector3();
  // one damage funnel: insta-kill override, points, drops, hitmark
  const hitZombie = (z: import('./zombies/zombies').Zombie, dmg: number, head: boolean, melee: boolean): void => {
    const outcome = zombies.applyDamage(z, drops.instaKill ? 1e5 : dmg);
    points.award(E.hit);
    if (outcome === 'killed') {
      points.award(melee ? E.meleeKill : head ? E.headshotKill : E.kill);
      drops.onKill(z.pos);
      // personal equipment (M14.5, DESIGN §8.6): a carrier ALWAYS drops what
      // he visibly carries — balance lives in the watch bill, never here
      if (z.crew.carry) drops.spawn(CARRY_DROP[z.crew.carry], z.pos);
    }
    hud.hitmark(head);
  };
  const doShot = (slot: WeaponSlot, rays: number): void => {
    const def = slot.def;
    camera.getWorldDirection(lookDir);
    // stab weapons (Line Lance, Bang Stick): a fast close sweep, not a ray
    if (def.stabRangeM !== undefined) {
      const targets = zombies.meleeTargets(camera.position, lookDir, def.stabRangeM, TUNING.weapons.knife.arcDeg, def.stabPierce ?? 1);
      audio.melee(targets.length > 0);
      for (const t of targets) {
        shotDir.copy(t.pos).sub(camera.position).normalize();
        zombies.knockback(t, shotDir, def.id === 'bangStick' ? 7 : 5);
        hitZombie(t, def.damage, false, true);
      }
      const sp = specials.nearestInArc(camera.position, lookDir, def.stabRangeM, TUNING.weapons.knife.arcDeg);
      if (sp) {
        specials.applyDamage(sp, def.damage);
        points.award(E.hit);
        hud.hitmark(false);
      }
      return;
    }
    audio.shot(def.id, def.papped ?? false);
    beamRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    beamUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    for (let ray = 0; ray < rays; ray++) {
      for (let pellet = 0; pellet < def.pellets; pellet++) {
        shotDir.copy(lookDir);
        // Twinfish: the two hands land a fixed hair apart
        if (def.burst > 1) shotDir.addScaledVector(beamRight, THREE.MathUtils.degToRad(def.burstSpreadDeg) * (ray - (rays - 1) / 2));
        if (def.spreadDeg > 0) {
          const s = THREE.MathUtils.degToRad(def.spreadDeg);
          shotDir.addScaledVector(beamRight, (Math.random() * 2 - 1) * s).addScaledVector(beamUp, (Math.random() * 2 - 1) * s);
        }
        shotDir.normalize();
        muzzle.copy(camera.position).addScaledVector(lookDir, 0.35).addScaledVector(beamRight, 0.14).addScaledVector(beamUp, -0.12);
        const res = zombies.raycastPierce(camera.position, shotDir, def.rangeM, def.pierce);
        // a special in front of the first zombie absorbs the pellet
        // (insta-kill does not touch the specials — they are not roster)
        const sp = specials.raycastShot(camera.position, shotDir, def.rangeM);
        if (sp && (res.hits.length === 0 || sp.dist < res.hits[0].dist)) {
          // M15 (DESIGN §8.2): the Arc Projector is the Angler's counter
          const anglerArc = def.chainCount > 0 && sp.special.kind === 'angler';
          specials.applyDamage(sp.special, def.damage * (anglerArc ? TUNING.specials.angler.arcBonusMult : 1));
          points.award(E.hit);
          hud.hitmark(false);
          tracers.spawn(muzzle, sp.point, def.tracer, def.tracerLifeSec);
          if (def.papped) impactGlow.spawn(sp.point);
          continue;
        }
        const endDist = Math.hypot(res.end[0] - camera.position.x, res.end[1] - camera.position.y, res.end[2] - camera.position.z);
        checkMounds(camera.position.x, camera.position.y, camera.position.z, shotDir.x, shotDir.y, shotDir.z, endDist);
        for (const h of res.hits) hitZombie(h.zombie, def.damage * (h.head ? def.headshotMult : 1), h.head, false);
        // Arc Projector: the water conducts — the first body struck chains.
        // M15 (DESIGN §8.2): if the Angler is in reach of the chain, EVERY
        // bounce re-targets it — a full arc lands all its hits on the fish.
        if (def.chainCount > 0 && res.hits.length > 0) {
          const from = res.hits[0].zombie;
          const angler = specials.specials.find((x) => x.kind === 'angler' && x.state !== 'dead');
          let prev = from.pos;
          if (angler && angler.pos.distanceTo(from.pos) <= def.chainRadiusM) {
            const mult = TUNING.specials.angler.arcBonusMult;
            for (let i = 0; i < def.chainCount; i++) {
              specials.applyDamage(angler, def.damage * def.chainFalloff ** (i + 1) * mult);
              points.award(E.hit);
              tracers.spawn([prev.x, prev.y, prev.z], [angler.pos.x, angler.pos.y, angler.pos.z], def.tracer, 0.3);
              if (def.papped) impactGlow.spawn([angler.pos.x, angler.pos.y, angler.pos.z]);
              prev = angler.pos;
              if (angler.state === 'dead') break;
            }
            hud.hitmark(false);
          } else {
            const links = zombies.chainFrom(from, def.chainRadiusM, def.chainCount);
            links.forEach((z, i) => {
              hitZombie(z, def.damage * def.chainFalloff ** (i + 1), false, false);
              tracers.spawn([prev.x, prev.y, prev.z], [z.pos.x, z.pos.y, z.pos.z], def.tracer, 0.3);
              if (def.papped) impactGlow.spawn([z.pos.x, z.pos.y, z.pos.z]);
              prev = z.pos;
            });
          }
        }
        // Vortex Maw: the impact point drags the room into itself
        if (def.vortexRadiusM > 0) {
          const caught = zombies.vortexPull(res.end, def.vortexRadiusM, def.vortexPullSec);
          if (caught > 0) flashStatus(`vortex: ${caught} caught`);
        }
        if (def.papped) impactGlow.spawn(res.end); // the universal rule: light
        tracers.spawn(muzzle, res.end, def.tracer, def.tracerLifeSec);
      }
    }
  };
  const doMelee = (): void => {
    camera.getWorldDirection(lookDir);
    viewModel.swingKnife(); // the swing (and its reach arc) shows even on air
    // the Bang Stick upgrades your melee to its one-hit shell while owned
    const bang = weapons.owns('bangStick');
    const dmg = bang ? TUNING.weapons.bangStick.damage : TUNING.weapons.knife.damage;
    const target = zombies.meleeTarget(camera.position, lookDir);
    audio.melee(target !== null);
    if (target) {
      shotDir.copy(target.pos).sub(camera.position).normalize();
      zombies.knockback(target, shotDir, bang ? 7 : 4); // the shove (user 2026-07-20)
      hitZombie(target, dmg, false, true);
      return;
    }
    const sp = specials.nearestInArc(camera.position, lookDir, TUNING.weapons.knife.rangeM, TUNING.weapons.knife.arcDeg);
    if (sp) {
      specials.applyDamage(sp, dmg);
      points.award(E.hit);
      hud.hitmark(false);
    }
  };

  const teleport = (nodeId: string): void => {
    const n = getNode(nodeId);
    camera.position.set(n.pos[0], n.pos[1] + Math.min(1, n.radius * 0.25), n.pos[2]);
    player.vel.set(0, 0, 0);
    if (player.mode === 'walk') player.mode = 'swim';
  };
  const spawn = (): void => {
    // The camp: on the dry shore shelf east of the pool mouth.
    camera.position.set(12, 2.2, 3.5);
    player.vel.set(0, 0, 0);
    player.mode = 'swim'; // falls and lands -> walk
    player.look(80, -10);
  };
  spawn();

  // ── playtest mode (editor "TEST" button): unsaved layout, noclip+god,
  // starting exactly where the editor camera was (user 2026-07-19) ──
  const playtest = params.has('playtest');
  if (playtest) {
    player.mode = 'noclip';
    vitals.god = true;
    rounds.paused = true; // map testing wants an empty cave
    try {
      const cam = JSON.parse(sessionStorage.getItem('bw-test-cam') ?? 'null') as { pos: [number, number, number]; yawDeg: number; pitchDeg: number } | null;
      if (cam) {
        camera.position.set(...cam.pos);
        player.look(cam.yawDeg, cam.pitchDeg);
      }
    } catch {
      // bad stash — spawn position stands
    }
  }
  const backToEditor = (): void => {
    sessionStorage.setItem('bw-test-return', '1');
    location.search = '?edit=1';
  };

  // ── hotkeys & debug ──
  // shared control state (tick writes, hotkeys read)
  const ctl = {
    grabbing: false,
    tTime: 0,
    xTime: 0,
    lineWasDeployed: false,
    reelBlockToasted: false,
    doorsOpen: 0,
    boxWasSpinning: false,
    papWasWorking: false,
    // M8b VO edges (rework 2026-07-20: Lowe speaks after 3 s FULLY out —
    // bobbing for a breath doesn't count)
    surfacedT: 0,
    wasSustained: false,
    airAtBreach: 100,
    wasAbove: false,
    voRound: 0,
    voStirs: false,
    idleT: 0,
    tally100: false,
    tally300: false,
    ePrev: false,
    eSwallow: false,
    // H freed the mouse for the debug panel — suppress the pause-on-unlock
    dbgMouseFree: false,
    // REMORA pacing (event lines re-request harmlessly — the queue dedupes)
    remAmbT: 0,
    // M12 v3 triggers (LORE §2.2.1): submerged-musing offer clock, the bell
    // round tracker, ascent clock, gun-count for rem.works, Moonlight latch
    swimAmbT: 0,
    v3BellRound: 0,
    ascentT: 0,
    gunsOwned: 1,
    moonlightStarted: false,
  };
  const heartNode = NODES.find((n) => n.tags.includes('heart'));
  // H toggles the DEBUG layer only — the game HUD stays up (user 2026-07-20:
  // "move all the required hud items to the game hud"). Opening it also
  // frees the mouse so the panel is clickable; closing re-locks (user
  // 2026-07-20). dbgMouseFree keeps the pointer-lock-loss pause handler
  // from reading the H-unlock as an Esc.
  debug.hotkey('KeyH', 'Toggle debug layer (frees/locks the mouse)', () => {
    const nowHidden = dbgLayer.classList.toggle('hidden');
    if (!nowHidden) {
      ctl.dbgMouseFree = true;
      document.exitPointerLock();
    } else {
      ctl.dbgMouseFree = false;
      if (played && !menus.blocking) renderer.domElement.requestPointerLock();
    }
  });
  debug.hotkey('KeyF', 'Flashlight', () => {
    if (vitals.battery > 0) vitals.flashlightOn = !vitals.flashlightOn;
  });
  debug.hotkey('KeyG', 'Toss chemlight', () => {
    if (vitals.dead || player.mode === 'noclip') return;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const p = camera.position;
    if (chems.toss([p.x, p.y - 0.15, p.z], [dir.x, dir.y, dir.z])) hud.toast(`CHEMLIGHT AWAY · ${chems.count} LEFT`);
  });
  debug.hotkey('KeyN', 'Noclip survey (debug)', () => {
    player.mode = player.mode === 'noclip' ? 'swim' : 'noclip';
    if (player.mode === 'noclip') vitals.god = true; // user: noclip implies god
  });
  // R = reload (the shooter set; line moved to T/X, user 2026-07-19 round
  // 12). When dead OR won it restarts the dive instead.
  debug.hotkey('KeyR', 'Reload / restart when dead or won', () => {
    if (vitals.dead || heart.won) location.reload();
    else if (player.mode !== 'noclip') {
      weapons.startReload({ reloadMult: perks.mods.reloadMult, fireDelayMult: 1 });
      audio.reload();
    }
  });
  // knife: RMB (bound in weapons) or V — instant, clear of every line key
  debug.hotkey('KeyV', 'Knife', () => {
    if (!vitals.dead && player.mode !== 'noclip') weapons.queueMelee();
  });
  // Ghost-wall probe: press P where collision feels wrong; records the spot
  // and the field-vs-mesh mismatch along your view for later diagnosis.
  // PERSISTENT now (user probed and the data was lost to a reload): probes
  // POST to the dev server (docs/probes.jsonl) AND mirror to localStorage.
  let probes: object[] = [];
  try {
    probes = JSON.parse(localStorage.getItem('bw-probes') ?? '[]') as object[];
  } catch {
    probes = [];
  }
  (window as { __bwProbes?: object[] }).__bwProbes = probes;
  const persistProbe = (entry: object): void => {
    try {
      localStorage.setItem('bw-probes', JSON.stringify(probes.slice(-200)));
    } catch {
      // storage full/unavailable — server sink still gets it
    }
    fetch('/__probe', { method: 'POST', body: JSON.stringify(entry) }).catch(() => {});
  };
  debug.hotkey('KeyP', 'Probe ghost wall (logs spot)', () => {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const c = camera.position;
    let t = 0;
    let fieldDist: number | null = null;
    for (let i = 0; i < 200; i++) {
      const d = sdf(c.x + dir.x * t, c.y + dir.y * t, c.z + dir.z * t);
      if (d >= 0) {
        fieldDist = t;
        break;
      }
      t += Math.max(0.05, -d * 0.8);
    }
    const ray = new THREE.Raycaster(c.clone(), dir.clone(), 0, 60);
    const hit = ray.intersectObject(caveMesh, false)[0];
    const entry = {
      t: new Date().toISOString(),
      pos: [c.x.toFixed(1), c.y.toFixed(1), c.z.toFixed(1)],
      look: [dir.x.toFixed(2), dir.y.toFixed(2), dir.z.toFixed(2)],
      collisionWallAt: fieldDist?.toFixed(2) ?? 'none<25m',
      visualWallAt: hit ? hit.distance.toFixed(2) : 'none<60m',
      region: regionAt(c.x, c.y, c.z),
    };
    probes.push(entry);
    persistProbe(entry);
    hud.toast(`PROBE #${probes.length} SAVED`); // visible confirmation (user)
    console.warn('[ghost-wall probe]', JSON.stringify(entry));
    flashStatus(`probe #${probes.length}: collision ${entry.collisionWallAt} m vs visual ${entry.visualWallAt} m`);
  });

  const view = debug.section('View');
  debug.button(view, 'Toggle game HUD (screenshots)', () => hudLayer.classList.toggle('hidden'));
  debug.button(view, 'Reset to spawn', spawn);
  debug.button(view, 'Open map viewer', () => {
    location.search = '?view=map&debug=1';
  });
  debug.button(view, 'Open level editor', () => {
    location.search = '?edit=1';
  });
  if (playtest) {
    debug.button(view, '⏎ Back to editor (F4)', backToEditor);
    debug.hotkey('F4', 'Back to editor (playtest)', backToEditor);
  }

  const tp = debug.section('Teleport');
  const select = document.createElement('select');
  select.style.width = '100%';
  const zones: Zone[] = ['sinkhole', 'galleries', 'maze', 'throat', 'abyss'];
  for (const z of zones) {
    const og = document.createElement('optgroup');
    og.label = z;
    for (const n of NODES.filter((n) => n.zone === z)) {
      const opt = document.createElement('option');
      opt.value = n.id;
      opt.textContent = n.id;
      og.appendChild(opt);
    }
    select.appendChild(og);
  }
  tp.appendChild(select);
  debug.button(tp, 'Teleport', () => teleport(select.value));

  const vit = debug.section('Vitals');
  debug.toggle(vit, 'God', () => vitals.god, (v) => (vitals.god = v));
  debug.toggle(vit, 'Infinite air', () => vitals.infiniteAir, (v) => (vitals.infiniteAir = v));
  debug.toggle(vit, 'Infinite battery', () => vitals.infiniteBattery, (v) => (vitals.infiniteBattery = v));
  debug.slider(vit, 'Air', 0, 100, 1, () => vitals.air, (v) => (vitals.air = v));
  debug.slider(vit, 'Battery', 0, 1, 0.01, () => vitals.battery, (v) => (vitals.battery = v));
  debug.button(vit, 'Damage 40', () => vitals.damage(40));

  // M4: silt, tilt, kit
  const nearestSiltChamber = (): string | null => {
    const p = camera.position;
    let best: string | null = null;
    let bestD = Infinity;
    for (const ch of silt.chambers) {
      const d = Math.hypot(p.x - ch.c[0], p.y - ch.c[1], p.z - ch.c[2]);
      if (d < bestD) {
        bestD = d;
        best = ch.id;
      }
    }
    return best;
  };
  const siltSec = debug.section('Silt & Tilt');
  debug.button(siltSec, 'Silt-out nearest chamber', () => {
    const id = nearestSiltChamber();
    if (id) {
      silt.forceSiltout(id);
      flashStatus(`silt-out in ${id}`);
    }
  });
  debug.button(siltSec, 'Stir nearest chamber', () => {
    const id = nearestSiltChamber();
    if (id) {
      silt.stir.set(id, 1);
      flashStatus(`stirred ${id}`);
    }
  });
  debug.button(siltSec, 'Clear all silt (re-arm mounds)', () => silt.clearAll());
  debug.slider(siltSec, 'Roll°', -180, 180, 1, () => player.measuredRollDeg, (v) => player.setRollDeg(v));
  debug.slider(siltSec, 'Max tilt° (accessibility)', 0, 180, 5, () => SETTINGS.maxTiltDeg, (v) => {
    SETTINGS.maxTiltDeg = v;
    saveSettings();
  });
  debug.toggle(siltSec, 'Fog off', () => atmo.fogOff, (v) => (atmo.fogOff = v));
  debug.toggle(siltSec, 'Fullscreen on play', () => SETTINGS.fullscreenOnPlay, (v) => {
    SETTINGS.fullscreenOnPlay = v;
    saveSettings();
  });
  debug.button(siltSec, 'Give reel (+200 m)', () => {
    guideLine.reelM += TUNING.guideLine.reelLengthM;
  });
  debug.button(siltSec, 'Give 10 chemlights', () => {
    chems.count += TUNING.chemlights.packSize;
  });

  const zSec = debug.section('Zombies & Rounds');
  debug.toggle(zSec, 'Shift clock paused', () => rounds.paused, (v) => (rounds.paused = v));
  debug.toggle(zSec, 'Despawn rolls', () => zombies.despawnEnabled, (v) => (zombies.despawnEnabled = v));
  const roundInput = document.createElement('input');
  roundInput.type = 'number';
  roundInput.min = '1';
  roundInput.value = '1';
  roundInput.style.width = '100%';
  zSec.appendChild(roundInput);
  debug.button(zSec, 'Start round N', () => {
    const ev = rounds.startRound(Math.max(1, Number(roundInput.value) || 1));
    if (ev.roundStarted) hud.setRound(ev.roundStarted);
  });
  debug.button(zSec, 'Spawn 1 at selected node', () => {
    const z = zombies.spawnAt(select.value, Math.max(1, rounds.round));
    flashStatus(z ? `${z.crew.name} (${z.crew.role}) on watch` : 'roster full — all 41 accounted for');
  });
  debug.button(zSec, 'Spawn 5 at selected node', () => {
    for (let i = 0; i < 5; i++) zombies.spawnAt(select.value, Math.max(1, rounds.round));
  });
  debug.button(zSec, 'Kill all', () => flashStatus(`recovered ${zombies.killAll()}`));
  debug.button(zSec, 'Kill all but 2 (Cave Stirs test)', () => flashStatus(`recovered ${zombies.killAll(2)}`));
  debug.button(zSec, 'Refill current weapon', () => weapons.refill(weapons.current.def.id));
  debug.button(zSec, 'Give 5000 points', () => points.award(5000));

  // ── M14.5: the Roster of 41 (crew book is internal; this panel is the
  // only place the names are ever visible) ──
  const rosterSec = debug.section('Roster of 41');
  const crewSelect = document.createElement('select');
  crewSelect.style.width = '100%';
  for (const p of CREW) {
    const o = document.createElement('option');
    o.value = p.name;
    o.textContent = `${p.name} — ${p.role}${p.carry ? ' ⚑' : ''}${p.quirk ? ` (${p.quirk})` : ''}`;
    crewSelect.appendChild(o);
  }
  rosterSec.appendChild(crewSelect);
  debug.button(rosterSec, 'Spawn crewman at selected node', () => {
    const z = zombies.spawnAt(select.value, Math.max(1, rounds.round), crewSelect.value);
    flashStatus(z ? `${z.crew.name} (${z.crew.role}) on watch` : `${crewSelect.value} is already out there`);
  });
  debug.button(rosterSec, "Who's on watch", () => {
    const names = [...zombies.roster.onWatch.values()].map((p) => p.name);
    flashStatus(`on watch (${names.length}/41): ${names.join(', ') || '—'}`);
  });
  debug.button(rosterSec, 'Watch counts (walked this run)', () => {
    const walked = [...zombies.roster.watches.entries()].sort((a, b) => b[1] - a[1]);
    flashStatus(walked.map(([n, c]) => `${n}×${c}`).join(' ') || 'nobody yet');
  });
  debug.slider(
    rosterSec,
    'Weight override (selected man)',
    0,
    10,
    0.1,
    () => zombies.roster.weightOverrides.get(crewSelect.value) ?? CREW.find((p) => p.name === crewSelect.value)?.weight ?? 1,
    (v) => zombies.roster.weightOverrides.set(crewSelect.value, v),
  );
  debug.button(rosterSec, 'Clear weight overrides', () => zombies.roster.weightOverrides.clear());

  const econSec = debug.section('Economy');
  debug.toggle(econSec, 'Power on', () => shops.powered, (v) => shops.setPowered(v));
  debug.button(econSec, 'Give 20000 ledger', () => points.award(20000));
  // M13 found-item economy
  debug.button(econSec, 'Give dynamite', () => inventory.addDynamite());
  debug.button(econSec, 'Give both grate keys', () => {
    inventory.addKey('gal-entry→gal-pile', 'PILE GRATE');
    inventory.addKey('mz-gate→mz-stores', 'STORES GRATE');
  });
  debug.button(econSec, 'Give fuel slug', () => inventory.addSlug());
  debug.button(econSec, 'Reset bell issues', () => {
    for (const b of shops.issues) b.reset();
    box.pullBell.reset();
    flashStatus('all stations may issue again');
  });
  debug.button(econSec, 'Hatch toll (5 bells, +5 shifts)', () => hatchToll());
  const perkSelect = document.createElement('select');
  perkSelect.style.width = '100%';
  for (const id of ALL_PERKS) {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = id;
    perkSelect.appendChild(o);
  }
  econSec.appendChild(perkSelect);
  debug.button(econSec, 'Give selected perk', () => {
    if (perks.buy(perkSelect.value as (typeof ALL_PERKS)[number]) === 'ok') {
      applyPerkEffects();
      if (perkSelect.value === 'barnacleHide') vitals.hp = perks.mods.maxHp;
    }
  });
  debug.button(econSec, 'Give ALL perks', () => {
    perks.giveAll();
    applyPerkEffects();
    vitals.hp = perks.mods.maxHp;
  });
  debug.button(econSec, 'Clear perks', () => {
    perks.clear();
    applyPerkEffects();
  });
  const gunSelect = document.createElement('select');
  gunSelect.style.width = '100%';
  for (const id of ['wristDart', ...WALL_GUNS, ...BOX_GUNS] as GunId[]) {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = id;
    gunSelect.appendChild(o);
  }
  econSec.appendChild(gunSelect);
  debug.button(econSec, 'Give selected weapon', () => weapons.give(gunSelect.value as GunId));
  debug.button(econSec, 'PaP current weapon (free)', () => {
    weapons.papSlot(weapons.current);
    hud.toast(`BENCHED FREE → ${weapons.current.def.name}`);
  });
  debug.button(econSec, 'Force box move on next spin', () => (box.forceMoveNext = true));
  const dropSelect = document.createElement('select');
  dropSelect.style.width = '100%';
  for (const id of ['maxAmmo', 'doublePoints', 'instaKill', 'clearWaters', 'batterySurge', 'pressureWave', 'fuelSlug'] as DropId[]) {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = id;
    dropSelect.appendChild(o);
  }
  econSec.appendChild(dropSelect);
  debug.button(econSec, 'Force selected drop (apply now)', () => drops.force(dropSelect.value as DropId));
  debug.button(econSec, 'Spawn selected drop at player', () => {
    const q = camera.position;
    drops.spawn(dropSelect.value as DropId, new THREE.Vector3(q.x, q.y - 0.4, q.z - 1.5));
  });

  const m7Sec = debug.section('Specials & Ascent');
  debug.button(m7Sec, 'Spawn Angler at selected node', () => specials.spawnAngler(select.value));
  debug.button(m7Sec, 'Kill all specials', () => specials.killAllSpecials());
  // M15: the deep ones
  for (const st of ['patrol', 'frozen', 'approach', 'leaving'] as const) {
    debug.button(m7Sec, `Angler: force ${st}`, () => specials.forceAnglerState(st));
  }
  debug.button(m7Sec, 'Lamp Man: spawn/relocate', () => {
    const lm = specials.spawnLampMan();
    flashStatus(lm ? `the lamp stands in ${lm.edgeId}` : 'no candidate tunnel');
  });
  debug.button(m7Sec, 'Lamp Man: despawn', () => specials.despawnLampMan());
  debug.button(m7Sec, 'Lamp Man: where?', () => {
    const lm = specials.lampMan;
    flashStatus(lm ? `standing in ${lm.edgeId} @ ${lm.pos.x.toFixed(0)},${lm.pos.y.toFixed(0)},${lm.pos.z.toFixed(0)} seen=${lm.lampSeen ?? false}` : 'nobody is standing anywhere');
  });
  debug.button(m7Sec, 'Jumpscare preview', () => doLampScare());
  debug.toggle(m7Sec, 'Scare tilt-safe (no roll)', () => scare.tiltSafe, (v) => (scare.tiltSafe = v));
  // M15.5: the Undertow
  let flowArrows: THREE.Group | null = null;
  debug.button(m7Sec, 'Undertow: arm now (no Heart needed)', () => {
    const home = NODES.find((n) => n.tags.includes('heart'));
    if (home) {
      undertow.arm(home.id, (e) => {
        const d = doorByEdge.get(e);
        return d ? d.open : true;
      });
      flashStatus(`undertow armed — field covers ${undertow.field?.next.size ?? 0} nodes`);
    }
  });
  debug.toggle(m7Sec, 'Undertow clock without Ascent', () => undertow.debugActive, (v) => (undertow.debugActive = v));
  debug.button(m7Sec, 'Undertow: force surge', () => {
    undertow.forceSurge();
    flashStatus('the cave inhales');
  });
  debug.button(m7Sec, 'Undertow: state', () =>
    flashStatus(
      !undertow.armed
        ? 'undertow not armed'
        : undertow.surging
          ? `SURGING t=${undertow.surgeT.toFixed(1)}s env=${undertowEnv.toFixed(2)}`
          : `armed — next surge in ${undertow.waitT.toFixed(0)}s`,
    ),
  );
  // M16: the Annex
  const annexSec = debug.section('The Annex (M16)');
  debug.toggle(annexSec, 'Unlock all exhibits', () => annex.unlockAll, (v) => (annex.unlockAll = v));
  debug.button(annexSec, 'Party toggle', () => annex.setParty(!annex.partyOn));
  debug.button(annexSec, 'Teleport to the Annex', () => teleport('annex'));
  debug.button(annexSec, 'Gallery: fill with placeholders', () => {
    for (let i = 0; i < 9; i++) {
      GALLERY.unlock({ id: `debug-${i}`, title: `PLACEHOLDER ${i + 1}`, url: toyPhotoDataUrl(i % 3), caption: 'debug print' });
    }
    flashStatus(`gallery: ${GALLERY.items.length} prints`);
  });
  debug.toggle(m7Sec, 'Flow-field arrows', () => flowArrows?.visible ?? false, (v) => {
    if (v && !flowArrows && undertow.field) {
      flowArrows = new THREE.Group();
      for (const n of NODES) {
        if (n.teaser || n.kind === 'audio') continue;
        const dir = pullAt(undertow.field, n.pos[0], n.pos[1], n.pos[2]);
        if (!dir) continue;
        flowArrows.add(new THREE.ArrowHelper(new THREE.Vector3(dir[0], dir[1], dir[2]), new THREE.Vector3(n.pos[0], n.pos[1], n.pos[2]), 2.2, 0x59c8e8, 0.7, 0.4));
      }
      scene.add(flowArrows);
    }
    if (flowArrows) flowArrows.visible = v;
  });
  debug.button(m7Sec, 'Grab the Heart (start Ascent)', () => heart.grab());
  debug.button(m7Sec, 'Show win screen (preview)', () => {
    hud.setLedger(runStats());
    hud.showWin();
  });

  const doorSec = debug.section('Doors');
  debug.button(doorSec, 'Open ALL doors', () => openAllDoors(doors));
  for (const d of doors) {
    debug.button(doorSec, `Open ${d.id} (${d.kind}${d.cost ? ` ${d.cost}` : ''})`, () => openDoor(doors, d.id));
  }

  // ── M8a: the soundscape, triggerable in 10 seconds (the harness rule) ──
  const audSec = debug.section('Audio');
  debug.button(audSec, 'Enable audio (context resume)', () => {
    audio.ensure();
    flashStatus(`audio: ${audio.engine?.ctx.state ?? 'none'}`);
  });
  debug.slider(audSec, 'Master volume', 0, 1, 0.05, () => SETTINGS.volumeMaster, (v) => {
    SETTINGS.volumeMaster = v;
    saveSettings();
    audio.engine?.setMasterVolume(v);
  });
  debug.button(audSec, 'Round stinger', () => sfxTest('round'));
  debug.button(audSec, 'Cave Stirs swell', () => sfxTest('stirs'));
  debug.button(audSec, 'Perk jingle', () => audio.perkBought());
  debug.button(audSec, 'Box tease', () => audio.boxSpin());
  debug.button(audSec, 'PaP motif', () => audio.papWork());
  debug.button(audSec, 'Door grind', () => audio.doorOpen());
  debug.button(audSec, 'Silt whump (here)', () => audio.siltOut([camera.position.x, camera.position.y, camera.position.z]));
  debug.button(audSec, 'Grab impact', () => audio.grab());
  debug.button(audSec, 'Shot (current gun)', () => audio.shot(weapons.current.def.id, weapons.current.def.papped ?? false));
  // M8b: voices & flavor
  debug.slider(audSec, 'VO volume', 0, 1, 0.05, () => SETTINGS.volumeVo, (v) => {
    SETTINGS.volumeVo = v;
    saveSettings();
  });
  debug.slider(audSec, 'Music volume', 0, 1, 0.05, () => SETTINGS.volumeMusic, (v) => {
    SETTINGS.volumeMusic = v;
    saveSettings();
  });
  debug.toggle(audSec, 'Subtitles', () => SETTINGS.subtitles, (v) => {
    SETTINGS.subtitles = v;
    saveSettings();
  });
  debug.button(audSec, 'Collect ALL tapes', () => {
    for (const t of TAPES) deck.collect(t.id);
    flashStatus(`tapes pending: ${deck.pending.length}`);
  });
  debug.button(audSec, 'Skip tape (B)', () => deck.skip());
  debug.button(audSec, 'Wind all 3 toys (jukebox)', () => toys.windAll());
  debug.button(audSec, 'Say a surfacing line', () => requestOneOf(surfacingPool()));
  debug.button(audSec, 'VO queue state', () => flashStatus(`queue ${voice.queue.map((l) => l.id).join(',') || '—'} | played ${voice.played.size} | cooldown ${voice.ambientCooldown.toFixed(0)}s`));
  const sfxTest = (which: 'round' | 'stirs'): void => {
    const e = audio.ensure();
    void import('./audio/sfx').then((s) => (which === 'round' ? s.roundStinger(e.ctx, e.master) : s.stirsStinger(e.ctx, e.master)));
  };
  // ── M12: one voice, one song ──
  debug.button(audSec, 'Shift bell ×1', () => {
    const e = audio.ensure();
    void import('./audio/sfx').then((s) => s.shiftBell(e.ctx, e.master));
  });
  debug.button(audSec, 'Shift bells ×5 (the hatch)', () => {
    const e = audio.ensure();
    void import('./audio/sfx').then((s) => s.bellSequence(e.ctx, e.master));
  });
  debug.button(audSec, 'Moonlight now', () => MUSIC.play('moonlight', '/music/easteregg/moonlight-at-the-waterline.mp3', TUNING.audio.moonlightGain, { name: 'Moonlight at the Waterline' }));
  debug.button(audSec, 'Stop music', () => MUSIC.stop());
  debug.button(audSec, 'Offer a swim musing', () => voice.request(['swim.1', 'swim.2', 'swim.3', 'swim.4', 'swim.5'].filter((id) => !voice.played.has(id))[0] ?? 'swim.1'));
  debug.button(audSec, 'Speech/music state', () =>
    flashStatus(
      `speaking: ${deck.playing ? 'TAPE' : voice.current ? 'LOWE ' + voice.current.id : remora.current ? 'REMORA ' + remora.current.id : '—'} | ` +
        `song: ${MUSIC.current ? MUSIC.current.id + ' (' + MUSIC.current.name + ')' : '—'} | quiet ${MUSIC.quietT.toFixed(0)}s | lull cd ${MUSIC.lullCooldown.toFixed(0)}s`,
    ),
  );

  buildTuningUI(debug.section('Tuning'));

  const info = debug.section('Info');
  const status = document.createElement('div');
  status.style.lineHeight = '1.5';
  info.appendChild(status);
  let statusFlash = 0;
  const flashStatus = (msg: string): void => {
    status.textContent = msg;
    statusFlash = 3;
  };
  const geoLine = document.createElement('div');
  geoLine.textContent = `mesh: ${tris.toLocaleString()} tris, ${genMs.toFixed(0)} ms gen`;
  info.appendChild(geoLine);

  // ── loop ──
  const fpsEl = document.getElementById('fps');
  if (!fpsEl) throw new Error('#fps missing');
  let frames = 0;
  let fpsTime = 0;
  let time = 0;
  const gradTmp: [number, number, number] = [0, 0, 0];
  const exhaleOrigin = new THREE.Vector3();
  const lookDir = new THREE.Vector3();
  const beamDir = new THREE.Vector3();
  const beamRight = new THREE.Vector3();
  const beamUp = new THREE.Vector3();
  const currentVec = new THREE.Vector3();
  const clock = new THREE.Clock();

  const tick = (dt: number): void => {
    time += dt;
    const p = camera.position;
    const lvl = waterLevelAt(p.x, p.y, p.z);
    const headAbove = lvl !== null && p.y > lvl;
    const region = regionAt(p.x, p.y, p.z);
    const zone: Zone = region?.zone ?? 'sinkhole';

    // reference up: regions can LIE about which way is up (the Listing Room,
    // deceptive tunnel air gaps) — the camera orients to the lie and the
    // water tilts with it; only the bubbles stay honest (user 2026-07-19)
    const falseUp = region ? falseUps.get(region.ref) : undefined;
    player.setReferenceUp(player.mode === 'noclip' ? null : falseUp ?? null);

    // tilt drifts only while swimming below the surface; breaking into air
    // (or noclip) auto-levels toward the reference up. X is gone — Q/E are
    // the player's manual roll now (user 2026-07-19). Gated at the gimbal
    // pole where roll is undefined (the max-tilt-0 spin bug).
    const tiltRef = player.mode === 'swim' && !headAbove ? (region?.ref ?? null) : null;
    if (!player.nearGimbalPole) {
      const rollKeys = player.keyDown('KeyQ') || player.keyDown('KeyE');
      const relevel = (headAbove || player.mode === 'noclip') && !rollKeys;
      const measuredRoll = player.measuredRollDeg;
      const newRoll = tilt.update(dt, tiltRef, relevel, time, measuredRoll);
      player.applyRollDelta(newRoll - measuredRoll);
    }
    sampleCurrent(p.x, p.y, p.z, time, currentVec);

    // inspect overlay escape hatch (user bug 2026-07-20: drift away from the
    // photograph while inspecting → the interact prompt is gone and the
    // overlay could never close). While it's open, E ALWAYS closes it —
    // proximity no longer matters. Esc works too. The closing press is
    // SWALLOWED until release, or the interact under the crosshair would
    // re-open the same overlay on the same key press (M8c fix).
    const eNow = player.keyDown('KeyE');
    if (hud.inspectOpen && ((eNow && !ctl.ePrev) || player.keyDown('Escape'))) {
      hud.closeInspect();
      ctl.eSwallow = true;
    }
    ctl.ePrev = eNow;
    if (!eNow) ctl.eSwallow = false;

    // ── buy prompts (M6a): E belongs to a live prompt, not to camera roll ──
    camera.getWorldDirection(lookDir);
    interact.update(dt, p, lookDir, !vitals.dead && player.mode !== 'noclip' && !hud.inspectOpen && !ctl.eSwallow && eNow);
    player.suppressRollE = interact.target !== null;
    hud.updatePrompt(player.mode === 'noclip' ? null : interact.targetPrompt, interact.progress);
    shops.update(dt);

    const hand: [number, number, number] = [p.x, p.y - 0.25, p.z];
    // wall grab (hold Ctrl near rock, user 2026-07-19): freeze in place —
    // pure movement brace against the current (no line duties anymore)
    ctl.grabbing =
      !vitals.dead &&
      player.mode === 'swim' &&
      (player.keyDown('ControlLeft') || player.keyDown('ControlRight')) &&
      sdf(p.x, p.y, p.z) > -(TUNING.player.radius + TUNING.player.grabWallDistM);
    if (ctl.grabbing) player.vel.set(0, 0, 0);

    // ── THE LINE (controls rework, user 2026-07-19 round 12: constant use,
    // in a panic, zero overlap with combat keys) ──
    //   T tap  = lay / stop / resume (context) — starting auto-anchors
    //   T hold = ride the line (follow, latched direction, free look)
    //   X tap  = tie-off while laying (instant — the 4 s ceremony is gone)
    //   X hold = reel in from the end: glide toward the anchor, collecting
    const HOLD_S = TUNING.guideLine.tapHoldSeconds;
    let following = false;
    let reeling = false;
    const tHeld = player.keyDown('KeyT');
    if (tHeld) {
      ctl.tTime += dt;
      if (ctl.tTime >= HOLD_S && !ctl.grabbing && player.mode === 'swim') {
        // hold: engage (or keep trying to); direction latches once
        if (!guideLine.followingActive) {
          camera.getWorldDirection(lookDir);
          guideLine.followBegin(hand, [lookDir.x, lookDir.y, lookDir.z]);
        }
        if (!vitals.dead && !headAbove) {
          const fv = guideLine.followVelocity(hand);
          if (fv) {
            following = true;
            player.vel.set(fv[0], fv[1], fv[2]);
            p.addScaledVector(player.vel, dt);
            resolveCollision(p, TUNING.player.radius);
          }
        }
      }
    } else {
      if (ctl.tTime > 0 && ctl.tTime < HOLD_S && !vitals.dead && player.mode !== 'noclip') {
        // tap: context toggle (line.ts owns the priority: stop → resume at an
        // end → fork off a strand's middle → start fresh). Main's only job is
        // finding a wall point so fresh starts auto-anchor to rock in reach.
        let wallPoint: [number, number, number] | undefined;
        const d = sdf(hand[0], hand[1], hand[2]);
        if (-d <= TUNING.guideLine.anchorReachM) {
          gradient(hand[0], hand[1], hand[2], gradTmp);
          const gl = Math.hypot(gradTmp[0], gradTmp[1], gradTmp[2]) || 1;
          wallPoint = [hand[0] - (gradTmp[0] / gl) * d, hand[1] - (gradTmp[1] / gl) * d, hand[2] - (gradTmp[2] / gl) * d];
        }
        const r = guideLine.toggleLaying(hand, wallPoint);
        hud.toast(
          r === 'stopped'
            ? 'LINE STOPPED'
            : r === 'discarded'
              ? 'LINE STOWED (never left the hand)'
              : r === 'resumed'
                ? 'LAYING LINE'
                : r === 'forked'
                  ? 'FORK — NEW LINE TIED ON HERE'
                  : r === 'anchored'
                    ? 'ANCHORED — LAYING LINE'
                    : 'LAYING LINE (no rock in reach to anchor)',
        );
      }
      guideLine.followEnd();
      ctl.tTime = 0;
    }
    const xHeld = player.keyDown('KeyX');
    if (xHeld && !vitals.dead && player.mode !== 'noclip') {
      ctl.xTime += dt;
      if (ctl.xTime >= HOLD_S) {
        if (guideLine.mode !== 'reeling' && guideLine.beginReel(hand)) hud.toast('REELING IN');
        if (guideLine.reelBlocked && !ctl.reelBlockToasted) {
          hud.toast('LINE PINNED — tap X at the tie to cut it');
          ctl.reelBlockToasted = true;
        }
        if (guideLine.mode === 'reeling' && player.mode === 'swim' && !ctl.grabbing && !headAbove) {
          const rv = guideLine.reelVelocity(hand);
          if (rv) {
            reeling = true;
            player.vel.set(rv[0], rv[1], rv[2]);
            p.addScaledVector(player.vel, dt);
            resolveCollision(p, TUNING.player.radius);
          }
        }
      }
    } else {
      if (ctl.xTime > 0 && ctl.xTime < HOLD_S && !vitals.dead && player.mode !== 'noclip') {
        // tap: tie-off while laying; otherwise CUT the nearest tie (that's
        // how you free a pinned line so reeling can continue past it)
        if (guideLine.mode === 'laying') {
          guideLine.pin(hand);
          hud.toast('TIE-OFF SET');
        } else if (guideLine.unpin(hand)) {
          hud.toast('TIE CUT — line is loose here');
        } else if (guideLine.deployed) {
          hud.toast('HOLD X AT A LINE END TO REEL IN');
        }
      }
      if (guideLine.mode === 'reeling') {
        guideLine.endReel();
        hud.toast('REEL PAUSED — LINE STOPPED');
      }
      ctl.xTime = 0;
      ctl.reelBlockToasted = false;
    }
    if (!vitals.dead && !following && !reeling && !ctl.grabbing) player.update(dt, lvl);

    // guide line pays out behind the hand (never in noclip, not while
    // hand-over-handing the line itself)
    if (player.mode !== 'noclip') guideLine.update(hand, !following);
    if (ctl.lineWasDeployed && !guideLine.deployed) hud.toast('LINE RECOVERED — STOWED');
    ctl.lineWasDeployed = guideLine.deployed;
    lineFx.update();
    chems.update(dt);
    chemFx.update(p);

    // ── silt: stirring, mound touch, state ──
    const chamber = silt.chamberAt(p.x, p.y, p.z);
    if (chamber && player.mode === 'swim' && !headAbove && !vitals.dead) {
      const speed = player.vel.length();
      const S = TUNING.silt;
      let nearFloor = false;
      for (let d = 0.6; d <= S.floorProximityM + 0.6; d += 0.5) {
        if (sdf(p.x, p.y - d, p.z) > -0.25) {
          nearFloor = true;
          break;
        }
      }
      // Steady Hands: your movement never stirs ambient silt
      if (!perks.mods.noStir && ((speed > S.stirSpeed && nearFloor) || (player.sprinting && player.moving))) silt.disturb(chamber, dt);
    }
    if (player.mode !== 'noclip' && !vitals.dead) {
      for (const m of moundSpots) {
        if (columnDistSq(m, p.x, p.y, p.z) < TUNING.silt.moundTouchM ** 2 && silt.detonate(m.nodeId)) {
          audio.siltOut(getNode(m.nodeId).pos);
          flashStatus(`chalk column detonated — ${m.nodeId}`);
        }
      }
    }
    silt.update(dt);
    syncMounds(moundVisuals, silt.armed, time);

    // ── vitals & presentation ──
    vitals.update(dt, {
      headAbove,
      sprinting: !following && player.sprinting,
      moving: player.moving || following,
      zone,
    });
    // close-wall exposure: drop lamp power as the closest lit surface gets
    // close, so point-blank rock doesn't blow out (M2.5 worklog → M4 pass).
    // Probes the beam CONE (center + 4 off-axis rays), not just the view axis.
    camera.getWorldDirection(lookDir);
    beamRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    beamUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    let wallT = 8;
    for (let ray = 0; ray < 5; ray++) {
      beamDir.copy(lookDir);
      if (ray === 1) beamDir.addScaledVector(beamRight, 0.6);
      else if (ray === 2) beamDir.addScaledVector(beamRight, -0.6);
      else if (ray === 3) beamDir.addScaledVector(beamUp, 0.6);
      else if (ray === 4) beamDir.addScaledVector(beamUp, -0.6);
      beamDir.normalize();
      let acc = 0;
      for (let i = 0; i < 10 && acc < wallT; i++) {
        const d = -sdf(p.x + beamDir.x * acc, p.y + beamDir.y * acc, p.z + beamDir.z * acc);
        if (d < 0.05) {
          wallT = Math.min(wallT, acc);
          break;
        }
        acc += Math.max(0.2, d * 0.9);
      }
    }
    // quadratic: apparent brightness stays constant as the wall closes in
    // (intensity/d² cancels) instead of blowing out; full power beyond ~4.5 m
    const exposure = THREE.MathUtils.clamp((wallT * wallT) / 20, 0.03, 1);
    headlamp.intensity = vitals.flashlightOn ? headlampBase * exposure * lightFactor(vitals.battery, Math.random()) : 0;
    const clearVis = TUNING.visibility.clearVisM[zone];
    const siltout = silt.siltoutAt(chamber);
    const siltThickness = silt.thicknessAt(chamber);
    const daylight = headAbove && Math.hypot(p.x, p.z) < 18 && p.y > -16; // open cenote only
    // noclip = debug map survey: full visibility and brightness (user);
    // Cat Eyes and Clear Waters lift visibility; the Ascent pulls it down
    const visMult =
      perks.mods.visMult * (drops.clearWaters ? TUNING.drops.clearWatersVisMult : 1) * (heart.ascentActive ? TUNING.ascent.visMult : 1);
    atmo.update(dt, p, headAbove, zone, silt.visibilityAt(chamber, clearVis) * visMult, siltout, currentVec, daylight, player.mode === 'noclip', siltThickness);
    siltFx.update(dt, p, siltThickness, !headAbove, currentVec);
    // squeeze claustrophobia: modest FOV pull-in (relative to the settings base)
    const targetFov = player.mode !== 'noclip' && player.inSqueeze ? SETTINGS.fov - 11 : SETTINGS.fov;
    if (Math.abs(camera.fov - targetFov) > 0.1) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, Math.min(1, dt * 4));
      camera.updateProjectionMatrix();
    }
    // exhale from the mouth, in front of and below the lens
    exhaleOrigin.set(0, 0, -1).applyQuaternion(camera.quaternion).multiplyScalar(0.4).add(p);
    exhaleOrigin.y -= 0.18;
    bubbles.update(dt, exhaleOrigin, !headAbove && player.mode !== 'noclip', time, vitals.hr);

    // ── Second Wind: the pocket ledger + the blackout revive ──
    if (headAbove && region && !region.ref.includes('~')) {
      const n = NODES.find((x) => x.id === region.ref);
      if (n && (n.tags.includes('airPocket') || n.tags.includes('surface') || n.dry)) lastPocketNodeId = n.id;
    }
    if (vitals.dead && !revive.active && perks.owned.has('secondWind')) {
      revive.active = true;
      revive.t = 0;
      hud.blackout(true, 'SECOND WIND');
    }
    if (revive.active) {
      revive.t += dt;
      if (revive.t >= TUNING.perks.secondWind.blackoutSec) {
        revive.active = false;
        perks.consumeSecondWind();
        applyPerkEffects();
        weapons.stripToSidearm();
        // carrying the Heart? it stays where you died (DESIGN §11)
        if (heart.held) heart.drop(p.clone());
        vitals.dead = false;
        vitals.hp = perks.mods.maxHp;
        vitals.air = perks.mods.airCap;
        teleport(lastPocketNodeId);
        hud.blackout(false);
        hud.toast('SECOND WIND — THE PERK IS SPENT');
        voice.request('secondwind.1'); // he wakes at a pocket: head above
      }
    }

    // ── combat: rounds, zombies, weapons (M5) + specials & the Ascent (M7) ──
    // noclip is a survey mode — the site ignores the surveyor; death freezes
    // the run (R restarts); the win freezes it kindly
    const combatFrozen = vitals.dead || player.mode === 'noclip' || heart.won;
    if (!combatFrozen) {
      run.timeSec += dt;
      const ev = rounds.update(dt); // M14: pure time — alive counts are irrelevant
      if (ev.roundStarted) {
        hud.setRound(ev.roundStarted);
        specials.onRoundStart(ev.roundStarted, p);
        flashStatus(`shift ${ev.roundStarted} — the bell`);
      }
      // the Ascent: global pressure on a flat clock, the hard cap still rules
      if (heart.ascentActive) {
        run.ascentSpawnT -= dt;
        if (run.ascentSpawnT <= 0 && zombies.aliveCount < TUNING.shifts.hardCap) {
          zombies.spawnNearPlayer(p, Math.max(1, rounds.round));
          run.ascentSpawnT = TUNING.ascent.spawnEverySec;
        }
        // surfacing with it = the recovery is complete
        if (heart.held && daylight && headAbove) {
          heart.won = true;
          hud.setAscent(false);
          hud.setLedger(runStats());
          hud.showWin();
          voice.request('win.1'); // the forty-two beat, in his head over the coda
          // M12: the ending holds INSIDE the song — the world's buses fade
          // out, the music bus and the head voices stay. If Moonlight (or
          // anything) is playing, it plays out clear to the end.
          audio.engine?.muteWorld();
        }
      }
      const acts = weapons.update(dt, { reloadMult: perks.mods.reloadMult, fireDelayMult: perks.mods.fireDelayMult });
      if (acts.fire) {
        doShot(acts.fire, acts.rays);
        viewModel.kick(Math.min(1.6, 0.5 + acts.fire.def.fireDelaySec)); // heavier guns shove harder
      }
      if (acts.melee) doMelee();
    }
    // M15: the decaying roll-whip after a Lamp Man scare
    if (scare.t > 0) {
      scare.t -= dt;
      if (!scare.tiltSafe) player.setRollDeg(clampRoll(player.measuredRollDeg + (Math.random() * 2 - 1) * 240 * dt));
    }
    specials.update(dt, {
      playerPos: p,
      playerDead: combatFrozen,
      time,
      lampOn: vitals.flashlightOn,
      sprinting: player.sprinting,
      lookDir,
      onHit: takeSpecialHit,
    });
    heart.update(dt, time);
    annex.update(dt, time, p, MUSIC.current?.id === 'party');
    // ── M15.5 the Undertow: the cave inhales (position-only — the pull
    // rides the shared current sampler; bubbles and the gauge stay honest) ──
    const ut = undertow.update(dt, heart.ascentActive && !combatFrozen);
    undertowEnv = ut.envelope;
    atmo.surge = ut.envelope;
    shops.setSurge(ut.envelope);
    if (ut.started) {
      audio.undertowSurge();
      if (ut.first) {
        voice.request('undertow.1');
        remora.request('rem.undertow.1');
      }
    }
    if (ut.envelope > 0.3 && undertow.field && !vitals.dead) {
      const dir = pullAt(undertow.field, p.x, p.y, p.z);
      if (dir) {
        undertowPull.set(dir[0], dir[1], dir[2]);
        // fighting the inhale costs heart rate — the true price is air
        if (player.vel.dot(undertowPull) < -0.5) vitals.strain(dt, TUNING.undertow.fightHrPerSec);
      }
    }
    if (vitals.dead && !revive.active) hud.setLedger(runStats());
    // viewmodel: current gun in hand, bob/kick/reload, knife-ready crosshair
    viewModel.setWeapon(weapons.current.def.id, weapons.current.def.papped);
    viewModel.update(dt, {
      reloading: weapons.reloading,
      speedM: player.vel.length(),
      time,
      hidden: player.mode === 'noclip' || vitals.dead,
    });
    hud.setKnifeReady(!combatFrozen && zombies.meleeTarget(p, lookDir) !== null);
    box.update(dt, time);
    pap.update(dt, time);
    drops.update(dt, p, time);
    impactGlow.update(dt);
    zombies.update(dt, {
      playerPos: p,
      playerDead: combatFrozen,
      time,
      onGrab: (fromDir) => {
        // the grab: damage + regulator rip + a shove and a roll kick — the
        // way a recovery diver takes hold of a body
        audio.grab();
        vitals.grabbed();
        hud.damageFlash();
        player.vel.addScaledVector(fromDir, TUNING.zombies.grabShoveSpeed);
        player.applyRollDelta((Math.random() < 0.5 ? -1 : 1) * TUNING.zombies.grabTiltKickDeg);
      },
    });
    tracers.update(dt);
    hud.updateWeapon(weapons);
    hud.update(dt, vitals, -p.y);
    hud.updateKit(guideLine, chems, following, ctl.grabbing, guideLine.nearEnd(hand));

    // ── M8b: Lowe's voice + the tapes (rework 2026-07-20: tapes play on
    // pickup at any depth; Lowe needs 3 s continuously out of the water) ──
    const above = headAbove && player.mode !== 'noclip' && !vitals.dead;
    if (above && !ctl.wasAbove) ctl.airAtBreach = vitals.air; // before refill
    ctl.wasAbove = above;
    ctl.surfacedT = above ? ctl.surfacedT + dt : 0;
    const sustained = ctl.surfacedT >= TUNING.voice.surfacedDelaySec;
    if (sustained && !ctl.wasSustained) {
      // he's properly out: the surfacing beat, judged by the air he ARRIVED
      // with (it refills fast while he catches his breath)
      if (ctl.airAtBreach < TUNING.voice.closeCallAir + 2) requestOneOf(['closecall.1', 'closecall.2', 'closecall.3']);
      else if (daylight) requestOneOf(surfacingPool());
      else requestOneOf(['pocket.1', 'pocket.2', 'pocket.3', 'pocket.4']);
    }
    ctl.wasSustained = sustained;
    if (rounds.round !== ctl.voRound) {
      if (ctl.voRound > 0 && sustained) requestOneOf(['round.1', 'round.2']);
      ctl.voRound = rounds.round;
    }
    // M12 re-point (the Cave Stirs dies at M14): Lowe's stragglers line now
    // fires on real crowd pressure, in-head, wherever he is
    if (zombies.aliveCount >= 7 && !ctl.voStirs) voice.request('stirs.1');
    ctl.voStirs = zombies.aliveCount >= 7;
    if (!ctl.tally100 && zombies.recovered >= 100) {
      ctl.tally100 = true;
      voice.request('tally.100');
    }
    if (!ctl.tally300 && zombies.recovered >= 300) {
      ctl.tally300 = true;
      voice.request('tally.300');
    }
    // idle at the platform, rare: stillness in daylight rolls a musing
    if (sustained && daylight && !player.moving && player.vel.lengthSq() < 0.04) {
      ctl.idleT += dt;
      if (ctl.idleT > TUNING.voice.idleAfterSec) {
        ctl.idleT = 0;
        // late in the run the client musing joins the platform rotation (v3)
        requestOneOf(rounds.round >= 8 ? ['idle.1', 'idle.2', 'client.1'] : ['idle.1', 'idle.2']);
      }
    } else ctl.idleT = 0;
    // tapes: play the moment they're picked up, wherever you are
    deck.update(dt);

    // ── the REMORA unit (user 2026-07-20, LORE §2.4): dialog BELOW the
    // surface, the exact complement of Lowe. Event triggers re-request
    // freely — the queue's once-per-run/dedupe rules carry the anti-spam. ──
    const submergedNow = !headAbove && player.mode !== 'noclip' && !vitals.dead;
    const depth = -p.y;
    if (submergedNow) {
      remora.request('rem.hello.1'); // the first dive engages the monitor
      if (depth > 50) remora.request('rem.depth.50');
      if (depth > 100) remora.request('rem.depth.100');
      if (depth > 150) remora.request('rem.depth.150');
      if (vitals.lowAir && !vitals.inReserve) remora.request('rem.air.low');
      if (vitals.inReserve) remora.request('rem.air.reserve');
      if (vitals.battery < 0.2 && vitals.battery > 0) remora.request('rem.battery.low');
      if (siltThickness > 0.6) remora.request('rem.silt.1');
      if (zombies.aliveCount > 0) remora.request('rem.contact.1');
      if (specials.specials.some((s) => s.kind === 'angler' && s.state !== 'dead')) remora.request('rem.angler.1');
      if (specials.specials.some((s) => s.kind === 'guardian' && s.state !== 'dead' && s.pos.distanceTo(p) < 25)) remora.request('rem.guardian.1');
      if (heartNode && !heart.held && !heart.won && Math.hypot(heartNode.pos[0] - p.x, heartNode.pos[1] - p.y, heartNode.pos[2] - p.z) < 12) remora.request('rem.heart.1');
      if (heart.ascentActive) remora.request('rem.ascent.1');
      if (shops.powered) remora.request('rem.power.1');
      if (zone === 'abyss') remora.request('rem.abyss.1');
      // ambient musings: offer one every ~90 s under; the queue's cooldown
      // and 40% roll still decide whether she actually says it
      ctl.remAmbT += dt;
      if (ctl.remAmbT > 90) {
        ctl.remAmbT = 0;
        const fresh = REMORA_LINES.filter((l) => l.cat === 'ambient' && !remora.played.has(l.id));
        if (fresh.length > 0) remora.request(fresh[Math.floor(Math.random() * fresh.length)].id);
      }
    }

    // ── M12 v3 triggers (LORE §2.2.1): the wrongness spread wide ──
    if (submergedNow) {
      // the inner voice at depth: a musing OFFERED periodically; the roll +
      // 120 s cooldown still decide (silence stays the default)
      ctl.swimAmbT += dt;
      if (ctl.swimAmbT > TUNING.voice.swimAmbientOfferSec) {
        ctl.swimAmbT = 0;
        const fresh = ['swim.1', 'swim.2', 'swim.3', 'swim.4', 'swim.5'].filter((id) => !voice.played.has(id));
        if (fresh.length > 0) voice.request(fresh[Math.floor(Math.random() * fresh.length)]);
      }
      if (MUSIC.quietT > TUNING.voice.silenceLineSec) remora.request('rem.silence.1');
      if (heartNode && !heart.held && Math.hypot(heartNode.pos[0] - p.x, heartNode.pos[1] - p.y, heartNode.pos[2] - p.z) < TUNING.voice.heartNearM) voice.request('heart.near.1');
      if (zone === 'abyss' && heartNode && !heart.won && Math.hypot(heartNode.pos[0] - p.x, heartNode.pos[1] - p.y, heartNode.pos[2] - p.z) < 22) remora.request('rem.warm.1');
    }
    if (rounds.round !== ctl.v3BellRound) {
      // the shift bell heard from below (bell.2/rem.hatch.1 wait for M13's hatch)
      if (ctl.v3BellRound > 0 && submergedNow) {
        voice.request('bell.1');
        remora.request('rem.bell.1');
      }
      ctl.v3BellRound = rounds.round;
    }
    if (heart.ascentActive && !heart.won) {
      ctl.ascentT += dt;
      if (ctl.ascentT > TUNING.voice.heartCarryDelaySec) voice.request('heart.carry.1');
      // rem.stirs re-pointed (M12): "re-tasking its complement" IS the Ascent
      if (ctl.ascentT > 15) remora.request('rem.stirs.1');
    }
    if (weapons.slots.length > ctl.gunsOwned) {
      if (submergedNow) remora.request('rem.works.1'); // the inventory answered
      ctl.gunsOwned = weapons.slots.length;
    }

    // ── M12 ONE VOICE: the shared speech slot — a tape blocks both, an
    // active speaker keeps it, else the better head-of-queue goes first ──
    const loweCanSpeak = !vitals.dead && player.mode !== 'noclip'; // the inner voice needs only a living head
    const slot = arbitrate(
      deck.playing !== null,
      { speaking: voice.current !== null, next: voice.peek() },
      { speaking: remora.current !== null, next: remora.peek() },
    );
    const startedLine = voice.update(dt, loweCanSpeak, slot.loweBlocked);
    if (startedLine) voicePlayer.play(startedLine);
    const remStarted = remora.update(dt, submergedNow, slot.remoraBlocked);
    if (remStarted) remoraPlayer.play(remStarted);

    toys.update();
    // subtitles: the tape wins the screen; typewriter pace follows the reel
    if (!SETTINGS.subtitles) hud.subtitle(null);
    else if (deck.playing) {
      const tp = deck.playing;
      const chars = Math.ceil(Math.min(1, tp.t / tp.durSec) * tp.tape.text.length);
      hud.subtitle(tp.tape.title, tp.tape.text.slice(0, chars), 'B skip');
    } else if (voice.current) hud.subtitle('LOWE', voice.current.text);
    else if (remora.current) hud.subtitle('REMORA', remora.current.text);
    else hud.subtitle(null);

    // ── M12 ONE SONG: the music slot ticks its quiet clock; the lull only
    // grows out of TRUE silence (no music AND no dialog — the user heard it
    // collide with the jukebox; never again) ──
    const dialogActive = deck.playing !== null || voice.current !== null || remora.current !== null;
    MUSIC.update(dt, dialogActive);
    if (!vitals.dead && !heart.won) MUSIC.tryLull('/music/lull.mp3', TUNING.audio.lullGain, TUNING.audio.lullAfterSec, TUNING.audio.lullCooldownSec);

    // ── "Moonlight at the Waterline" — the ascent finale (user 2026-07-21):
    // carrying the Heart shallower than 50 m with no song playing starts it;
    // winning while it plays holds the ending inside the song ──
    if (heart.ascentActive && !heart.won && depth < TUNING.voice.moonlightDepthM && !MUSIC.playing && !ctl.moonlightStarted && !vitals.dead) {
      ctl.moonlightStarted = true;
      MUSIC.play('moonlight', '/music/easteregg/moonlight-at-the-waterline.mp3', TUNING.audio.moonlightGain, { name: 'Moonlight at the Waterline' });
    }

    // ── audio (M8a): state edges + the per-tick snapshot ──
    const openNow = doors.filter((d) => d.open).length;
    if (openNow > ctl.doorsOpen) audio.doorOpen();
    ctl.doorsOpen = openNow;
    if (box.state === 'spinning' && !ctl.boxWasSpinning) audio.boxSpin();
    ctl.boxWasSpinning = box.state === 'spinning';
    if (pap.state === 'working' && !ctl.papWasWorking) audio.papWork();
    ctl.papWasWorking = pap.state === 'working';
    beamRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    audio.update(dt, {
      playerPos: p,
      right: beamRight,
      headAbove,
      hr: vitals.hr,
      air: vitals.air,
      lowAir: vitals.lowAir,
      inReserve: vitals.inReserve,
      drowning: !headAbove && vitals.air <= 0 && !vitals.inReserve && !vitals.dead,
      dead: vitals.dead,
      won: heart.won,
      round: rounds.round,
      siltThickness,
      zombies: zombies.zombies,
      specials: specials.specials,
      powered: shops.powered,
    });
    if (statusFlash > 0) statusFlash -= dt;
  };

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    // menus freeze the run (the harness calls tick directly and is unaffected)
    if (!menus.blocking) tick(dt);
    renderer.render(scene, camera);
    frames++;
    fpsTime += dt;
    if (fpsTime >= 0.5) {
      fpsEl.textContent = `${Math.round(frames / fpsTime)} FPS`;
      if (statusFlash <= 0) {
        const p = camera.position;
        const r = regionAt(p.x, p.y, p.z);
        status.textContent = `${player.mode} | depth ${(-p.y).toFixed(1)} m | ${r ? `${r.zone}/${r.width}` : 'off-graph'} | vis ${atmo.visM.toFixed(0)} m | roll ${tilt.rollDeg.toFixed(0)}° | S${rounds.shift} bell in ${rounds.shiftT.toFixed(0)}s · ${zombies.aliveCount} alive (${zombies.zombies.filter((z) => z.state !== 'dead' && z.mode === 'hunt').length} hunting)`;
      }
      frames = 0;
      fpsTime = 0;
    }
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Harness hook (M0 worklog): drives the game while the pane is hidden.
  const harness = {
    camera,
    player,
    vitals,
    silt,
    tilt,
    line: guideLine,
    chems,
    atmo,
    moundSpots,
    rounds,
    zombies,
    weapons,
    points,
    perks,
    shops,
    interact,
    doors,
    box,
    pap,
    drops,
    specials,
    heart,
    runStats,
    inventory,
    roster: zombies.roster,
    crew: CREW,
    undertow,
    samples: SAMPLES,
    hatchToll,
    audio,
    audioVerify: () => import('./audio/verify'),
    voice,
    remora,
    music: MUSIC,
    deck,
    toys,
    menus,
    applyPerkEffects,
    doShot,
    doMelee,
    teleport,
    spawn,
    doorOpen: (id: string) => openDoor(doors, id),
    doorsOpenAll: () => openAllDoors(doors),
    setAir: (v: number) => (vitals.air = v),
    setBattery: (v: number) => (vitals.battery = v),
    sdfAt: (x: number, y: number, z: number) => sdf(x, y, z),
    region: (x: number, y: number, z: number) => regionAt(x, y, z),
    waterLevelAt,
    currentAt: (x: number, y: number, z: number): [number, number, number] => {
      const v = new THREE.Vector3();
      sampleCurrent(x, y, z, time, v);
      return [v.x, v.y, v.z];
    },
    stats: { tris, genMs },
    caveMesh,
    renderer,
    THREE,
    key: (code: string, down: boolean): void => {
      window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }));
    },
    renderOnce: (): void => renderer.render(scene, camera),
    step: (frames = 1, dt = 1 / 60): void => {
      for (let i = 0; i < frames; i++) tick(dt);
      renderer.render(scene, camera);
    },
    look: (yawDeg: number, pitchDeg: number): void => player.look(yawDeg, pitchDeg),
    shot: async (name: string): Promise<string> => {
      renderer.render(scene, camera);
      const data = renderer.domElement.toDataURL('image/png');
      const res = await fetch(`/__shot?name=${encodeURIComponent(name)}`, { method: 'POST', body: data });
      return `${name}: ${res.status}`;
    },
    bench: (frames = 120): number => {
      renderer.render(scene, camera); // warm-up
      const t0 = performance.now();
      for (let i = 0; i < frames; i++) renderer.render(scene, camera);
      return (performance.now() - t0) / frames; // ms per frame
    },
  };
  (window as { __bw?: unknown }).__bw = harness;
}
