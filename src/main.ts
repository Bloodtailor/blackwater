import * as THREE from 'three';
import './style.css';
import { DebugPanel } from './debug/panel';
import { NODES, getNode, type Zone } from './cave/data';
import { initSdf, regionAt, resolveCollision, sdf } from './cave/sdf';
import { buildCaveMesh } from './cave/mesh';
import { buildDoors, openAllDoors, openDoor } from './cave/doors';
import { buildMounds, placeMounds, syncMounds } from './cave/mounds';
import { PlayerController } from './player/controller';
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

  const dryPockets = NODES.filter((n) => n.dry).map((n) => {
    const s = n.stretch ?? [1, 1, 1];
    const rx = n.radius * s[0];
    const ry = n.radius * s[1];
    const rz = n.radius * s[2];
    const level = n.pos[1] - ry * 0.35;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(Math.max(rx, rz) * 0.8, 24), waterMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(n.pos[0], level, n.pos[2]);
    scene.add(disc);
    return { c: n.pos, rx: rx * 1.25, ry: ry * 1.25, rz: rz * 1.25, level };
  });
  const waterLevelAt = (x: number, y: number, z: number): number | null => {
    if (Math.hypot(x, z) < 18 && y > -16) return WATER_Y; // open cenote water
    for (const p of dryPockets) {
      const dx = (x - p.c[0]) / p.rx;
      const dy = (y - p.c[1]) / p.ry;
      const dz = (z - p.c[2]) / p.rz;
      if (dx * dx + dy * dy + dz * dz < 1) return p.level;
    }
    return null;
  };

  // ── atmosphere & silt (M4) ──
  const fog = new THREE.FogExp2(0x062226, 0.035);
  scene.fog = fog;
  const atmo = new Atmosphere(scene, fog, ambient, headlamp);
  const silt = new SiltSystem(chambersFromNodes(NODES));
  const siltFx = new SiltParticles(scene);

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

  // tie-off proximity (anchor/pin the guide line): inside a tieOff node's
  // ellipsoid, padded by the tie-off reach
  const tieOffNodes = NODES.filter((n) => n.tags.includes('tieOff')).map((n) => {
    const s = n.stretch ?? [1, 1, 1];
    const pad = TUNING.guideLine.tieOffRadiusM;
    return { rx: n.radius * s[0] + pad, ry: n.radius * s[1] + pad, rz: n.radius * s[2] + pad, c: n.pos };
  });
  const nearTieOff = (p: THREE.Vector3): boolean =>
    tieOffNodes.some((t) => {
      const dx = (p.x - t.c[0]) / t.rx;
      const dy = (p.y - t.c[1]) / t.ry;
      const dz = (p.z - t.c[2]) / t.rz;
      return dx * dx + dy * dy + dz * dz <= 1;
    });

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

  // ── hotkeys & debug ──
  debug.hotkey('KeyH', 'Hide UI (screenshot mode)', () => ui.classList.toggle('hidden'));
  debug.hotkey('KeyF', 'Flashlight', () => {
    if (vitals.battery > 0) vitals.flashlightOn = !vitals.flashlightOn;
  });
  debug.hotkey('KeyQ', 'Line: anchor / tie-off / reel', () => {
    if (vitals.dead || player.mode === 'noclip') return;
    const p = camera.position;
    const hand: [number, number, number] = [p.x, p.y - 0.25, p.z];
    const r = guideLine.pressQ(hand, nearTieOff(p));
    if (r) flashStatus(`line: ${r} (${guideLine.reelM.toFixed(0)} m on reel)`);
  });
  debug.hotkey('KeyG', 'Toss chemlight', () => {
    if (vitals.dead || player.mode === 'noclip') return;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const p = camera.position;
    if (chems.toss([p.x, p.y - 0.15, p.z], [dir.x, dir.y, dir.z])) flashStatus(`chemlight away (${chems.count} left)`);
  });
  debug.hotkey('KeyN', 'Noclip (debug)', () => {
    player.mode = player.mode === 'noclip' ? 'swim' : 'noclip';
  });
  debug.hotkey('KeyR', 'Restart (when dead)', () => {
    if (vitals.dead) location.reload();
  });
  // Ghost-wall probe: press P where collision feels wrong; records the spot
  // and the field-vs-mesh mismatch along your view for later diagnosis.
  const probes: object[] = [];
  (window as { __bwProbes?: object[] }).__bwProbes = probes;
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
      pos: [c.x.toFixed(1), c.y.toFixed(1), c.z.toFixed(1)],
      look: [dir.x.toFixed(2), dir.y.toFixed(2), dir.z.toFixed(2)],
      collisionWallAt: fieldDist?.toFixed(2) ?? 'none<25m',
      visualWallAt: hit ? hit.distance.toFixed(2) : 'none<60m',
      region: regionAt(c.x, c.y, c.z),
    };
    probes.push(entry);
    console.warn('[ghost-wall probe]', JSON.stringify(entry));
    flashStatus(`probe #${probes.length}: collision ${entry.collisionWallAt} m vs visual ${entry.visualWallAt} m`);
  });

  const view = debug.section('View');
  debug.button(view, 'Reset to spawn', spawn);
  debug.button(view, 'Open map viewer', () => {
    location.search = '?view=map&debug=1';
  });

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
  debug.slider(siltSec, 'Roll°', -180, 180, 1, () => tilt.rollDeg, (v) => (tilt.rollDeg = v));
  debug.slider(siltSec, 'Max tilt° (accessibility)', 0, 180, 5, () => SETTINGS.maxTiltDeg, (v) => {
    SETTINGS.maxTiltDeg = v;
    saveSettings();
  });
  debug.toggle(siltSec, 'Fog off', () => atmo.fogOff, (v) => (atmo.fogOff = v));
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
  const exhaleOrigin = new THREE.Vector3();
  const lookDir = new THREE.Vector3();
  const beamDir = new THREE.Vector3();
  const beamRight = new THREE.Vector3();
  const beamUp = new THREE.Vector3();
  const clock = new THREE.Clock();

  const tick = (dt: number): void => {
    time += dt;
    const p = camera.position;
    const lvl = waterLevelAt(p.x, p.y, p.z);
    const headAbove = lvl !== null && p.y > lvl;
    const region = regionAt(p.x, p.y, p.z);
    const zone: Zone = region?.zone ?? 'sinkhole';

    // tilt drifts only while swimming below the surface; X re-levels
    const tiltRef = player.mode === 'swim' && !headAbove ? (region?.ref ?? null) : null;
    tilt.update(dt, tiltRef, player.keyDown('KeyX'), time);
    player.roll = THREE.MathUtils.degToRad(tilt.rollDeg);

    // follow mode (hold T near the line): hand-over-hand glide — works blind
    let following = false;
    if (!vitals.dead && player.mode === 'swim' && !headAbove && player.keyDown('KeyT')) {
      camera.getWorldDirection(lookDir);
      const fv = guideLine.followVelocity([p.x, p.y, p.z], [lookDir.x, lookDir.y, lookDir.z]);
      if (fv) {
        following = true;
        player.vel.set(fv[0], fv[1], fv[2]);
        p.addScaledVector(player.vel, dt);
        resolveCollision(p, TUNING.player.radius);
      }
    }
    if (!vitals.dead && !following) player.update(dt, lvl);

    // guide line pays out behind the hand (never in noclip, not while
    // hand-over-handing the line itself)
    if (player.mode !== 'noclip') guideLine.update([p.x, p.y - 0.25, p.z], !following);
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
        const dx = p.x - m.center[0];
        const dy = p.y - m.center[1];
        const dz = p.z - m.center[2];
        if (dx * dx + dy * dy + dz * dz < TUNING.silt.moundTouchM ** 2 && silt.detonate(m.nodeId)) {
          flashStatus(`chalk mound detonated — ${m.nodeId}`);
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
    atmo.update(dt, p, headAbove, zone, silt.visibilityAt(chamber, clearVis), siltout);
    siltFx.update(dt, p, silt.thicknessAt(chamber), !headAbove);
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
    hud.updateKit(guideLine, chems, following);
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
