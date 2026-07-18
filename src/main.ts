import * as THREE from 'three';
import './style.css';
import { createPlaceholderChamber } from './scene/placeholder';
import { DebugPanel } from './debug/panel';
import { Freefly } from './debug/freefly';

const params = new URLSearchParams(location.search);

if (params.get('view') === 'map') {
  void import('./viewer/map').then((m) => m.initMapViewer());
} else {
  initGame();
}

function initGame(): void {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020709);
  scene.fog = new THREE.FogExp2(0x062226, 0.035);

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 300);
  scene.add(camera);
  // Spotlight headlamp — previews the real flashlight cone (M3 replaces this).
  const headlamp = new THREE.SpotLight(0xcfe0d4, 55, 45, THREE.MathUtils.degToRad(38), 0.7, 2);
  headlamp.position.set(0, 0, 0);
  headlamp.target.position.set(0, 0, -1);
  camera.add(headlamp, headlamp.target);

  scene.add(createPlaceholderChamber());

  const debug = new DebugPanel(params.has('debug'));
  const fly = new Freefly(camera, renderer.domElement);

  const ui = document.getElementById('ui');
  if (!ui) throw new Error('#ui missing');
  debug.hotkey('KeyH', 'Hide UI (screenshot mode)', () => ui.classList.toggle('hidden'));
  const view = debug.section('View');
  debug.button(view, 'Reset camera', () => camera.position.set(0, 0, 0));
  debug.toggle(
    view,
    'Freefly',
    () => fly.enabled,
    (v) => (fly.enabled = v),
  );
  debug.button(view, 'Open map viewer', () => {
    location.search = '?view=map&debug=1';
  });

  const fpsEl = document.getElementById('fps');
  if (!fpsEl) throw new Error('#fps missing');
  let frames = 0;
  let fpsTime = 0;
  const clock = new THREE.Clock();

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    fly.update(dt);
    renderer.render(scene, camera);
    frames++;
    fpsTime += dt;
    if (fpsTime >= 0.5) {
      fpsEl.textContent = `${Math.round(frames / fpsTime)} FPS`;
      frames = 0;
      fpsTime = 0;
    }
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Harness hook: lets the dev harness drive the game while the Browser pane is
  // hidden (rAF throttled to zero). shot() renders + reads pixels in the same
  // task, so no preserveDrawingBuffer is needed. Grows into pilot mode (M9).
  const harness = {
    camera,
    renderOnce: (): void => renderer.render(scene, camera),
    // Advance real update frames while rAF is stalled (hidden pane).
    step: (frames = 1, dt = 1 / 60): void => {
      for (let i = 0; i < frames; i++) fly.update(dt);
      renderer.render(scene, camera);
    },
    look: (yawDeg: number, pitchDeg: number): void => fly.look(yawDeg, pitchDeg),
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
