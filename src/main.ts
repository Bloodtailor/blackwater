import * as THREE from 'three';
import './style.css';
import { DebugPanel } from './debug/panel';
import { buildTuningUI } from './debug/tuningPanel';
import { EDGES, NODES, buildAirWaterMap, buildFalseUpMap, getNode, waterSurfaceLevel, type Zone } from './cave/data';
import { initSdf, regionAt, resolveCollision, sdf } from './cave/sdf';
import { buildCaveMesh } from './cave/mesh';
import { buildDoors, openAllDoors, openDoor } from './cave/doors';
import { buildMounds, columnDistSq, placeMounds, syncMounds } from './cave/mounds';
import { PlayerController } from './player/controller';
import { sampleCurrent } from './player/current';
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
import { Hud } from './ui/hud';
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
    // tilted rooms tilt their water too (user 2026-07-19): the surface is a
    // plane normal to the region's falseUp, so the level varies across x,z
    return ws ? waterSurfaceLevel(ws, x, z) : null;
  };
  // pool surfaces: drawn only where a region's water line actually cuts its
  // cavity (flat-floored bells occlude theirs except down the entrance hole).
  // Shaped as the room's own ellipse cross-section (not a max-radius circle,
  // which spilled outside stretched rooms) and tilted to the room's falseUp.
  const orientDisc = (disc: THREE.Mesh, up?: [number, number, number]): void => {
    disc.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...(up ?? [0, 1, 0])).normalize());
  };
  for (const n of NODES) {
    if (!n.dry || n.waterY === undefined) continue;
    const s = n.stretch ?? [1, 1, 1];
    const ry = n.radius * s[1];
    const rel = (n.waterY - n.pos[1]) / ry;
    if (rel <= -1 || rel >= 1) continue; // line misses this room entirely
    const chord = Math.sqrt(1 - rel * rel);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 24), waterMat);
    disc.geometry.scale(chord * n.radius * s[0] * 1.08, chord * n.radius * s[2] * 1.08, 1);
    orientDisc(disc, n.falseUp);
    disc.position.set(n.pos[0], n.waterY, n.pos[2]);
    scene.add(disc);
  }
  // the slide's plunge surface: a disc where the chute meets its pool
  for (const e of EDGES.filter((e) => e.slide && e.waterY !== undefined)) {
    const pts: [number, number, number][] = [getNode(e.a).pos, ...(e.waypoints ?? []), getNode(e.b).pos];
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay, az] = pts[i - 1];
      const [bx, by, bz] = pts[i];
      const w = e.waterY!;
      if ((ay - w) * (by - w) > 0) continue;
      const t = (w - ay) / (by - ay || 1);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(2.8, 20), waterMat);
      orientDisc(disc, e.falseUp);
      disc.position.set(ax + (bx - ax) * t, w, az + (bz - az) * t);
      scene.add(disc);
      break;
    }
  }

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
  const kb = (navigator as { keyboard?: { lock?: (keys?: string[]) => Promise<void> } }).keyboard;
  let played = false;
  renderer.domElement.addEventListener('click', () => {
    played = true;
    if (SETTINGS.fullscreenOnPlay && !document.fullscreenElement) {
      document.documentElement
        .requestFullscreen()
        .then(() => kb?.lock?.(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'KeyT', 'KeyF', 'KeyC', 'KeyG', 'KeyN', 'KeyP', 'KeyH', 'Space']))
        .catch(() => {});
    }
  });
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
  const ui = document.getElementById('ui');
  if (!ui) throw new Error('#ui missing');
  const hud = new Hud(ui);

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
  const ctl = { grabbing: false, tieTimer: 0 };
  debug.hotkey('KeyH', 'Hide UI (screenshot mode)', () => ui.classList.toggle('hidden'));
  debug.hotkey('KeyF', 'Flashlight (anchor/tie while grabbing)', () => {
    if (ctl.grabbing) return; // F is the tie-off ceremony while wall-grabbing
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
  debug.hotkey('KeyR', 'Lay/stop line (restart when dead)', () => {
    if (vitals.dead) {
      location.reload();
      return;
    }
    if (player.mode === 'noclip') return;
    const p = camera.position;
    const r = guideLine.toggleLaying([p.x, p.y - 0.25, p.z]);
    hud.toast(
      r === 'started' || r === 'resumed' ? 'LAYING LINE' : r === 'stopped' ? 'LINE STOPPED' : 'LINE ENDS ELSEWHERE',
    );
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

  const doorSec = debug.section('Doors');
  debug.button(doorSec, 'Open ALL doors', () => openAllDoors(doors));
  for (const d of doors) {
    debug.button(doorSec, `Open ${d.id} (${d.kind}${d.cost ? ` ${d.cost}` : ''})`, () => openDoor(doors, d.id));
  }

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
  let fPrev = false;
  let cPrev = false;
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

    const hand: [number, number, number] = [p.x, p.y - 0.25, p.z];
    // wall grab (hold Ctrl near rock, user 2026-07-19): freeze in place —
    // the current can't move you, and the tie ceremony happens here
    ctl.grabbing =
      !vitals.dead &&
      player.mode === 'swim' &&
      (player.keyDown('ControlLeft') || player.keyDown('ControlRight')) &&
      sdf(p.x, p.y, p.z) > -(TUNING.player.radius + TUNING.player.grabWallDistM);
    if (ctl.grabbing) player.vel.set(0, 0, 0);

    // follow mode (hold T near the line): direction LATCHES on engage so you
    // can look around freely while hand-over-handing (user 2026-07-19)
    let following = false;
    const tHeld = player.keyDown('KeyT');
    if (!tHeld) {
      guideLine.followEnd();
    } else if (!ctl.grabbing && player.mode === 'swim') {
      // engage (or keep trying to) while held; direction latches once
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
    if (!vitals.dead && !following && !ctl.grabbing) player.update(dt, lvl);

    // the anchor/tie ceremony: HOLD F for 4 s while wall-grabbing; tap F at a
    // stopped line's end to resume laying; tap C there to reel in
    const fHeld = player.keyDown('KeyF');
    const cHeld = player.keyDown('KeyC');
    if (ctl.grabbing && fHeld) {
      if (!fPrev && guideLine.resumeLaying(hand)) {
        hud.toast('LAYING LINE');
        ctl.tieTimer = 0;
      } else if (guideLine.mode === 'laying' || !guideLine.deployed) {
        ctl.tieTimer += dt;
        if (ctl.tieTimer >= TUNING.guideLine.tieSeconds) {
          const r = guideLine.pin(hand);
          hud.toast(r === 'anchored' ? 'ANCHOR SET — LAYING LINE' : 'TIE-OFF SET');
          ctl.tieTimer = 0;
        }
      }
    } else {
      ctl.tieTimer = 0;
    }
    if (ctl.grabbing && cHeld && !cPrev && guideLine.beginReel(hand)) hud.toast('REELING IN');
    fPrev = fHeld;
    cPrev = cHeld;

    // guide line pays out behind the hand (never in noclip, not while
    // hand-over-handing the line itself)
    if (player.mode !== 'noclip') guideLine.update(hand, !following);
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
      if ((speed > S.stirSpeed && nearFloor) || (player.sprinting && player.moving)) silt.disturb(chamber, dt);
    }
    if (player.mode !== 'noclip' && !vitals.dead) {
      for (const m of moundSpots) {
        if (columnDistSq(m, p.x, p.y, p.z) < TUNING.silt.moundTouchM ** 2 && silt.detonate(m.nodeId)) {
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
    // noclip = debug map survey: full visibility and brightness (user)
    atmo.update(dt, p, headAbove, zone, silt.visibilityAt(chamber, clearVis), siltout, currentVec, daylight, player.mode === 'noclip', siltThickness);
    siltFx.update(dt, p, siltThickness, !headAbove, currentVec);
    // squeeze claustrophobia: modest FOV pull-in
    const targetFov = player.mode !== 'noclip' && player.inSqueeze ? 64 : 75;
    if (Math.abs(camera.fov - targetFov) > 0.1) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, Math.min(1, dt * 4));
      camera.updateProjectionMatrix();
    }
    // exhale from the mouth, in front of and below the lens
    exhaleOrigin.set(0, 0, -1).applyQuaternion(camera.quaternion).multiplyScalar(0.4).add(p);
    exhaleOrigin.y -= 0.18;
    bubbles.update(dt, exhaleOrigin, !headAbove && player.mode !== 'noclip', time, vitals.hr);
    hud.update(dt, vitals, -p.y);
    hud.updateKit(guideLine, chems, following, ctl.grabbing, ctl.tieTimer / TUNING.guideLine.tieSeconds);
    if (statusFlash > 0) statusFlash -= dt;
  };

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    tick(dt);
    renderer.render(scene, camera);
    frames++;
    fpsTime += dt;
    if (fpsTime >= 0.5) {
      fpsEl.textContent = `${Math.round(frames / fpsTime)} FPS`;
      if (statusFlash <= 0) {
        const p = camera.position;
        const r = regionAt(p.x, p.y, p.z);
        status.textContent = `${player.mode} | depth ${(-p.y).toFixed(1)} m | ${r ? `${r.zone}/${r.width}` : 'off-graph'} | vis ${atmo.visM.toFixed(0)} m | roll ${tilt.rollDeg.toFixed(0)}°`;
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
