import * as THREE from 'three';
import './style.css';
import { DebugPanel } from './debug/panel';
import { Freefly } from './debug/freefly';
import { NODES, getNode, type Zone } from './cave/data';
import { initSdf, regionAt, resolveCollision, sdf } from './cave/sdf';
import { buildCaveMesh } from './cave/mesh';
import { buildDoors, openAllDoors, openDoor } from './cave/doors';
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
  // Spotlight headlamp — previews the real flashlight cone (M3 replaces this).
  const headlamp = new THREE.SpotLight(0xcfe0d4, 70, 50, THREE.MathUtils.degToRad(42), 0.65, 2);
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
  // Daylight down the cenote shaft: distance-limited so it can't leak deep.
  const sun = new THREE.PointLight(0xfff2d6, 320, 48, 2);
  sun.position.set(0, 11, 0);
  scene.add(sun);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(36, 36),
    new THREE.MeshStandardMaterial({
      color: 0x2a5a66,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      roughness: 0.25,
      metalness: 0.1,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_Y;
  scene.add(water);

  const ENV = {
    under: { bg: 0x041418, fog: 0x062226, density: 0.035, ambient: 0.5 },
    above: { bg: 0x8fb6c4, fog: 0x9fc3cf, density: 0.012, ambient: 0.65 },
  };
  const fog = new THREE.FogExp2(ENV.under.fog, ENV.under.density);
  scene.fog = fog;
  let wasAbove: boolean | null = null;
  const applyEnv = () => {
    const above = camera.position.y > WATER_Y;
    if (above === wasAbove) return;
    wasAbove = above;
    const env = above ? ENV.above : ENV.under;
    scene.background = new THREE.Color(env.bg);
    fog.color.setHex(env.fog);
    fog.density = env.density;
    ambient.intensity = env.ambient;
  };

  // ── movement (freefly + SDF collision until M3's swim controller) ──
  const debug = new DebugPanel(params.has('debug'));
  const fly = new Freefly(camera, renderer.domElement);
  let collide = true;
  fly.resolve = (p) => {
    if (collide) resolveCollision(p, TUNING.player.radius);
  };
  fly.speedFactor = () => {
    if (!collide) return 1;
    const r = regionAt(camera.position.x, camera.position.y, camera.position.z);
    return r?.width === 'squeeze' ? 0.3 : 1;
  };

  const teleport = (nodeId: string): void => {
    const n = getNode(nodeId);
    camera.position.set(n.pos[0], n.pos[1] + Math.min(1, n.radius * 0.25), n.pos[2]);
  };
  teleport('sink-platform');
  camera.position.y = 1.2;
  fly.look(180, -15);

  // ── debug UI ──
  const ui = document.getElementById('ui');
  if (!ui) throw new Error('#ui missing');
  debug.hotkey('KeyH', 'Hide UI (screenshot mode)', () => ui.classList.toggle('hidden'));
  debug.hotkey('KeyN', 'Toggle collision (noclip)', () => (collide = !collide));

  const view = debug.section('View');
  debug.button(view, 'Reset to spawn', () => {
    teleport('sink-platform');
    camera.position.y = 1.2;
  });
  debug.toggle(view, 'Collision', () => collide, (v) => (collide = v));
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
  const clock = new THREE.Clock();

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    fly.update(dt);
    applyEnv();
    renderer.render(scene, camera);
    frames++;
    fpsTime += dt;
    if (fpsTime >= 0.5) {
      fpsEl.textContent = `${Math.round(frames / fpsTime)} FPS`;
      const p = camera.position;
      const r = regionAt(p.x, p.y, p.z);
      status.textContent = `depth ${(-p.y).toFixed(1)} m | ${r ? `${r.zone} / ${r.width} / ${r.ref}` : 'outside graph'} | d ${sdf(p.x, p.y, p.z).toFixed(2)}`;
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
    teleport,
    doorOpen: (id: string) => openDoor(doors, id),
    doorsOpenAll: () => openAllDoors(doors),
    setCollide: (v: boolean) => (collide = v),
    sdfAt: (x: number, y: number, z: number) => sdf(x, y, z),
    region: (x: number, y: number, z: number) => regionAt(x, y, z),
    stats: { tris, genMs },
    renderOnce: (): void => renderer.render(scene, camera),
    step: (frames = 1, dt = 1 / 60): void => {
      for (let i = 0; i < frames; i++) fly.update(dt);
      applyEnv();
      renderer.render(scene, camera);
    },
    look: (yawDeg: number, pitchDeg: number): void => fly.look(yawDeg, pitchDeg),
    shot: async (name: string): Promise<string> => {
      applyEnv();
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
