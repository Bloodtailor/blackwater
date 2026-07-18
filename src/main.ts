import * as THREE from 'three';
import './style.css';
import { DebugPanel } from './debug/panel';
import { NODES, getNode, type Zone } from './cave/data';
import { initSdf, regionAt, sdf } from './cave/sdf';
import { buildCaveMesh } from './cave/mesh';
import { buildDoors, openAllDoors, openDoor } from './cave/doors';
import { PlayerController } from './player/controller';
import { lightFactor, Vitals } from './player/vitals';
import { Bubbles } from './player/bubbles';
import { Hud } from './ui/hud';

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
  const headlamp = new THREE.SpotLight(0xcfe0d4, headlampBase, 65, THREE.MathUtils.degToRad(42), 0.65, 2);
  headlamp.position.set(0, 0, 0);
  headlamp.target.position.set(0, 0, -1);
  camera.add(headlamp, headlamp.target);

  // ── cave ──
  initSdf();
  const { mesh: caveMesh, tris, genMs } = buildCaveMesh();
  scene.add(caveMesh);
  const doors = buildDoors(scene);

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

  const ENV = {
    under: { bg: 0x041418, fog: 0x062226, density: 0.035, ambient: 0.5 },
    above: { bg: 0x8fb6c4, fog: 0x9fc3cf, density: 0.012, ambient: 0.65 },
  };
  const fog = new THREE.FogExp2(ENV.under.fog, ENV.under.density);
  scene.fog = fog;
  let wasAbove: boolean | null = null;
  const applyEnv = (headAbove: boolean) => {
    if (headAbove === wasAbove) return;
    wasAbove = headAbove;
    const env = headAbove ? ENV.above : ENV.under;
    scene.background = new THREE.Color(env.bg);
    fog.color.setHex(env.fog);
    fog.density = env.density;
    ambient.intensity = env.ambient;
  };

  // ── player ──
  const debug = new DebugPanel(params.has('debug'));
  const player = new PlayerController(camera, renderer.domElement);
  const vitals = new Vitals();
  player.onLunge = () => vitals.onLunge();
  const bubbles = new Bubbles();
  scene.add(bubbles.points);
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

  // ── hotkeys & debug ──
  debug.hotkey('KeyH', 'Hide UI (screenshot mode)', () => ui.classList.toggle('hidden'));
  debug.hotkey('KeyF', 'Flashlight', () => {
    if (vitals.battery > 0) vitals.flashlightOn = !vitals.flashlightOn;
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
    status.textContent = `probe #${probes.length} logged — collision ${entry.collisionWallAt} m vs visual ${entry.visualWallAt} m`;
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

  const doorSec = debug.section('Doors');
  debug.button(doorSec, 'Open ALL doors', () => openAllDoors(doors));
  for (const d of doors) {
    debug.button(doorSec, `Open ${d.id} (${d.kind}${d.cost ? ` ${d.cost}` : ''})`, () => openDoor(doors, d.id));
  }

  const info = debug.section('Info');
  const status = document.createElement('div');
  status.style.lineHeight = '1.5';
  info.appendChild(status);
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
  const clock = new THREE.Clock();

  const tick = (dt: number): void => {
    time += dt;
    const p = camera.position;
    const lvl = waterLevelAt(p.x, p.y, p.z);
    const headAbove = lvl !== null && p.y > lvl;
    if (!vitals.dead) player.update(dt, lvl);
    const zone: Zone = regionAt(p.x, p.y, p.z)?.zone ?? 'sinkhole';
    vitals.update(dt, {
      headAbove,
      sprinting: player.sprinting,
      moving: player.moving,
      zone,
    });
    headlamp.intensity = vitals.flashlightOn ? headlampBase * lightFactor(vitals.battery, Math.random()) : 0;
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
    applyEnv(headAbove);
    hud.update(dt, vitals, -p.y);
  };

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    tick(dt);
    renderer.render(scene, camera);
    frames++;
    fpsTime += dt;
    if (fpsTime >= 0.5) {
      fpsEl.textContent = `${Math.round(frames / fpsTime)} FPS`;
      const p = camera.position;
      const r = regionAt(p.x, p.y, p.z);
      status.textContent = `${player.mode} | depth ${(-p.y).toFixed(1)} m | ${r ? `${r.zone}/${r.width}` : 'off-graph'} | air ${vitals.air.toFixed(0)} hp ${vitals.hp.toFixed(0)} bat ${(vitals.battery * 100).toFixed(0)}%`;
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
