// Map viewer (?view=map): my "napkin sketch" that can't drift from reality,
// because it renders the same data the game uses (DESIGN.md §16).
// 3D wireframe (freefly) + top/side blueprint canvases + assertion results.

import * as THREE from 'three';
import { EDGES, getNode, NODES, ZONE_COLORS, type CaveEdge } from '../cave/data';
import { runChecks } from '../cave/validate';
import { Freefly } from '../debug/freefly';

const BP_W = 1700;
const BP_H = 1100;

function edgePoints(e: CaveEdge): [number, number, number][] {
  return [getNode(e.a).pos, ...(e.waypoints ?? []), getNode(e.b).pos];
}

function edgeStyle(e: CaveEdge): { color: string; width: number; dash: number[] } {
  if (e.width === 'squeeze') return { color: '#ff9d45', width: 2, dash: [6, 5] };
  if (e.width === 'open') return { color: '#7d92a0', width: 7, dash: [] };
  return { color: '#a8b6bd', width: 3.5, dash: [] };
}

function drawBlueprint(canvas: HTMLCanvasElement, mode: 'top' | 'side'): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const px = (p: [number, number, number]) => (mode === 'top' ? p[0] : p[2]);
  const py = (p: [number, number, number]) => (mode === 'top' ? p[2] : -p[1]);

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of NODES) {
    minX = Math.min(minX, px(n.pos)); maxX = Math.max(maxX, px(n.pos));
    minY = Math.min(minY, py(n.pos)); maxY = Math.max(maxY, py(n.pos));
  }
  const margin = 10;
  const scale = Math.min((BP_W - 160) / (maxX - minX + margin * 2), (BP_H - 140) / (maxY - minY + margin * 2));
  const ox = 90 - (minX - margin) * scale;
  const oy = 90 - (minY - margin) * scale;
  const X = (p: [number, number, number]) => ox + px(p) * scale;
  const Y = (p: [number, number, number]) => oy + py(p) * scale;

  ctx.fillStyle = '#071018';
  ctx.fillRect(0, 0, BP_W, BP_H);

  // grid every 10 m
  ctx.strokeStyle = 'rgba(90,140,160,0.12)';
  ctx.lineWidth = 1;
  ctx.font = '12px Consolas, monospace';
  for (let gx = Math.floor((minX - margin) / 10) * 10; gx <= maxX + margin; gx += 10) {
    ctx.beginPath();
    ctx.moveTo(ox + gx * scale, 0);
    ctx.lineTo(ox + gx * scale, BP_H);
    ctx.stroke();
  }
  for (let gy = Math.floor((minY - margin) / 10) * 10; gy <= maxY + margin; gy += 10) {
    ctx.beginPath();
    ctx.moveTo(0, oy + gy * scale);
    ctx.lineTo(BP_W, oy + gy * scale);
    ctx.stroke();
    if (mode === 'side') {
      ctx.fillStyle = 'rgba(140,190,210,0.5)';
      ctx.fillText(`${gy} m`, 8, oy + gy * scale - 4);
    }
  }

  // edges
  for (const e of EDGES) {
    const pts = edgePoints(e);
    const s = edgeStyle(e);
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.setLineDash(s.dash);
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.moveTo(X(pts[0]), Y(pts[0]));
    for (let i = 1; i < pts.length; i++) ctx.lineTo(X(pts[i]), Y(pts[i]));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    // markers at midpoint
    const mid = pts[Math.floor(pts.length / 2)];
    const mx = pts.length % 2 ? X(mid) : (X(pts[0]) + X(pts[pts.length - 1])) / 2;
    const my = pts.length % 2 ? Y(mid) : (Y(pts[0]) + Y(pts[pts.length - 1])) / 2;
    if (e.door) {
      ctx.fillStyle = '#ff5252';
      ctx.fillRect(mx - 5, my - 5, 10, 10);
      ctx.fillStyle = '#ffd0d0';
      ctx.font = 'bold 13px Consolas, monospace';
      ctx.fillText(String(e.door.cost), mx + 8, my + 4);
    }
    if (e.powerGate) {
      ctx.strokeStyle = '#4dd0e1';
      ctx.lineWidth = 2;
      ctx.strokeRect(mx - 5, my - 5, 10, 10);
    }
    if (e.tilt) {
      ctx.fillStyle = '#ce93d8';
      ctx.beginPath();
      ctx.arc(mx, my, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '10px Consolas, monospace';
      ctx.fillText(`${e.tilt.maxDeg}°`, mx + 5, my - 5);
    }
  }

  // nodes
  for (const n of NODES) {
    const x = X(n.pos);
    const y = Y(n.pos);
    const r = Math.max(4, n.radius * scale * 0.6);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `#${ZONE_COLORS[n.zone].toString(16).padStart(6, '0')}`;
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#03080c';
    ctx.stroke();
    // tag glyphs
    ctx.font = 'bold 11px Consolas, monospace';
    let glyph = '';
    if (n.tags.includes('airPocket') || n.tags.includes('surface')) glyph = 'O2';
    else if (n.tags.includes('burrow')) glyph = '▲';
    else if (n.tags.includes('chalkMound')) glyph = '✳';
    else if (n.tags.includes('toy')) glyph = '♦';
    if (glyph) {
      ctx.fillStyle = '#fff';
      ctx.fillText(glyph, x - 6, y + 4);
    }
    ctx.fillStyle = 'rgba(220,240,245,0.85)';
    ctx.font = '10px Consolas, monospace';
    ctx.fillText(n.id, x + r + 2, y + 3);
  }

  // title + legend
  ctx.fillStyle = '#9fd8cf';
  ctx.font = 'bold 20px Consolas, monospace';
  ctx.fillText(mode === 'top' ? 'SITE BLACKWATER — PLAN (X/Z)' : 'SITE BLACKWATER — PROFILE (Z / DEPTH)', 24, 34);
  ctx.font = '12px Consolas, monospace';
  const legend = [
    ['#a8b6bd', 'passage'], ['#7d92a0', 'open chamber link'], ['#ff9d45', 'squeeze (dashed)'],
    ['#ff5252', 'door + cost'], ['#4dd0e1', 'power gate'], ['#ce93d8', 'tilt zone'],
  ];
  let ly = BP_H - 24 - legend.length * 18;
  ctx.fillStyle = 'rgba(3,10,14,0.8)';
  ctx.fillRect(BP_W - 250, ly - 20, 235, legend.length * 18 + 30);
  for (const [color, label] of legend) {
    ctx.fillStyle = color;
    ctx.fillRect(BP_W - 238, ly - 8, 18, 8);
    ctx.fillStyle = '#c4dbd6';
    ctx.fillText(label, BP_W - 212, ly);
    ly += 18;
  }
  const zoneEntries = Object.entries(ZONE_COLORS);
  let zx = 24;
  for (const [zone, color] of zoneEntries) {
    ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    ctx.beginPath();
    ctx.arc(zx + 6, 56, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c4dbd6';
    ctx.fillText(zone, zx + 16, 60);
    zx += ctx.measureText(zone).width + 44;
  }
}

async function postCanvas(canvas: HTMLCanvasElement, name: string): Promise<string> {
  const res = await fetch(`/__shot?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    body: canvas.toDataURL('image/png'),
  });
  return `${name}: ${res.status}`;
}

function makeLabelSprite(text: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 48;
  const ctx = c.getContext('2d')!;
  ctx.font = '24px Consolas, monospace';
  ctx.fillStyle = 'rgba(230,250,245,0.9)';
  ctx.fillText(text, 4, 32);
  const tex = new THREE.CanvasTexture(c);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(8, 1.5, 1);
  return sprite;
}

export function initMapViewer(): void {
  document.getElementById('hint')?.classList.add('hidden');

  // ── 3D wireframe ──
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x040a10);
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);

  for (const n of NODES) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(n.radius, 12, 9),
      new THREE.MeshBasicMaterial({ color: ZONE_COLORS[n.zone], wireframe: true, transparent: true, opacity: 0.5 }),
    );
    mesh.position.set(...n.pos);
    scene.add(mesh);
    const label = makeLabelSprite(n.id);
    label.position.set(n.pos[0], n.pos[1] + n.radius + 1, n.pos[2]);
    scene.add(label);
  }
  for (const e of EDGES) {
    const pts = edgePoints(e).map((p) => new THREE.Vector3(...p));
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const color = e.door ? 0xff5252 : e.width === 'squeeze' ? 0xff9d45 : 0x9fb8c8;
    scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 })));
  }

  const fly = new Freefly(camera, renderer.domElement);
  camera.position.set(45, -20, -25);
  fly.look(140, -15);

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    fly.update(Math.min(clock.getDelta(), 0.1));
    renderer.render(scene, camera);
  });
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ── sidebar: assertions + blueprints ──
  const ui = document.getElementById('ui');
  if (!ui) throw new Error('#ui missing');
  const panel = document.createElement('div');
  panel.id = 'map-ui';
  const title = document.createElement('h3');
  title.textContent = 'BLACKWATER — MAP VIEWER';
  panel.appendChild(title);

  const results = runChecks();
  const resBox = document.createElement('div');
  resBox.className = 'checks';
  const passCount = results.filter((r) => r.pass).length;
  const summary = document.createElement('div');
  summary.className = passCount === results.length ? 'check-pass' : 'check-fail';
  summary.textContent = `LAYOUT RULES: ${passCount}/${results.length} PASS`;
  resBox.appendChild(summary);
  for (const r of results) {
    const line = document.createElement('div');
    line.className = r.pass ? 'check-pass' : 'check-fail';
    line.textContent = `${r.pass ? '✓' : '✗'} ${r.name} — ${r.detail}`;
    resBox.appendChild(line);
  }
  panel.appendChild(resBox);

  const topCanvas = document.createElement('canvas');
  const sideCanvas = document.createElement('canvas');
  for (const c of [topCanvas, sideCanvas]) {
    c.width = BP_W;
    c.height = BP_H;
  }
  drawBlueprint(topCanvas, 'top');
  drawBlueprint(sideCanvas, 'side');

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save blueprints to docs/screens/';
  const saveBlueprints = async (): Promise<string[]> => [
    await postCanvas(topCanvas, 'm1-blueprint-top'),
    await postCanvas(sideCanvas, 'm1-blueprint-side'),
  ];
  saveBtn.addEventListener('click', () => void saveBlueprints());
  panel.appendChild(saveBtn);
  panel.appendChild(topCanvas);
  panel.appendChild(sideCanvas);
  ui.appendChild(panel);

  (window as { __bwMap?: unknown }).__bwMap = {
    camera,
    look: (yawDeg: number, pitchDeg: number) => fly.look(yawDeg, pitchDeg),
    shot: async (name: string): Promise<string> => {
      renderer.render(scene, camera);
      return postCanvas(renderer.domElement, name);
    },
    saveBlueprints,
    results,
  };
}
