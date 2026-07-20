// THE LEVEL EDITOR (`?edit=1`) — design caves visually instead of editing
// layout.json by hand (user request 2026-07-19).
//
//  • Orbit: left-drag rotate, wheel zoom, right-drag pan. F frames selection.
//  • Click a room / tunnel / orange waypoint to select; a gizmo appears —
//    drag it to move things. Shift-click a second room to connect a tunnel.
//  • Double-click a tunnel to insert a waypoint at that spot.
//  • Delete removes the selection (rooms cascade their tunnels). Ctrl+Z undo.
//  • Every field of every room/tunnel is editable in the side panel; the
//    DESIGN §5 rule checks re-run live after every change.
//  • SAVE writes src/cave/layout.json through the dev server — reload the
//    game tab and you're swimming in the edit. PREVIEW ROCK generates the
//    real cave mesh in-editor.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { EDGES, NODES, ZONE_COLORS, ZONE_HUBS, getNode, refreshNodeMap, roomWaterPlane, type CaveEdge, type CaveNode, type Zone } from '../cave/data';
import { buildWaterSurfaces } from '../cave/waterViz';
import { buildPanel, type PanelApi } from './panel';
import { initSdf } from '../cave/sdf';
import { buildCaveMesh } from '../cave/mesh';

export type Selection =
  | { kind: 'node'; id: string }
  | { kind: 'edge'; index: number }
  | { kind: 'waypoint'; edgeIndex: number; wpIndex: number }
  | null;

const WIDTH_COLORS = { open: 0x7fb6d9, normal: 0xc9c9c9, squeeze: 0xff9040 } as const;

export function initEditor(): void {
  document.getElementById('ui')?.classList.add('hidden');

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14181c);
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1200);
  camera.position.set(80, 40, -30);
  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(60, 120, 40);
  scene.add(sun);
  scene.add(new THREE.GridHelper(260, 52, 0x2a3238, 0x20262b));

  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.set(0, -60, 45);
  orbit.enableDamping = true;

  const gizmo = new TransformControls(camera, renderer.domElement);
  // three r169+: the visual lives in getHelper(); older versions ARE the helper
  const gizmoObj = gizmo as unknown as { getHelper?: () => THREE.Object3D };
  scene.add(gizmoObj.getHelper ? gizmoObj.getHelper() : (gizmo as unknown as THREE.Object3D));
  gizmo.addEventListener('dragging-changed', (e) => {
    orbit.enabled = !(e as unknown as { value: boolean }).value;
    if (!(e as unknown as { value: boolean }).value) commit(); // drag finished
  });

  // ── visuals ──
  const nodeGroup = new THREE.Group();
  const edgeGroup = new THREE.Group();
  const wpGroup = new THREE.Group();
  const labelGroup = new THREE.Group();
  const markerGroup = new THREE.Group();
  scene.add(nodeGroup, edgeGroup, wpGroup, labelGroup, markerGroup);
  markerGroup.visible = false; // water/false-up gizmos start hidden (🧭 toggles)
  let rockMesh: THREE.Mesh | null = null;
  const nodeMeshes = new Map<string, THREE.Mesh>();
  const sphereGeo = new THREE.SphereGeometry(1, 20, 14);
  const wpGeo = new THREE.OctahedronGeometry(0.55);

  let selection: Selection = null;
  // a proxy object the gizmo drags; we copy its position into the data
  const dragProxy = new THREE.Object3D();
  scene.add(dragProxy);

  const makeLabel = (text: string, pos: [number, number, number], dy: number): void => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 48;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.font = '26px Consolas, monospace';
    ctx.fillStyle = '#cfe8df';
    ctx.textAlign = 'center';
    ctx.fillText(text, 128, 32);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
    sprite.scale.set(9, 1.7, 1);
    sprite.position.set(pos[0], pos[1] + dy + 1, pos[2]);
    labelGroup.add(sprite);
  };

  // Water surfaces (shared with the game) + falseUp arrows. Separate from
  // rebuild() so the water gizmo can refresh them live mid-drag.
  const waterMarkMat = new THREE.MeshBasicMaterial({ color: 0x2a6a80, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
  function rebuildMarkers(): void {
    for (let i = markerGroup.children.length - 1; i >= 0; i--) markerGroup.remove(markerGroup.children[i]);
    markerGroup.add(buildWaterSurfaces(waterMarkMat));
    for (const n of NODES) {
      if (n.falseUp) markerGroup.add(new THREE.ArrowHelper(new THREE.Vector3(...n.falseUp), new THREE.Vector3(...n.pos), n.radius + 2, 0xff4488, 1.2, 0.7));
    }
    for (const e of EDGES) {
      if (!e.falseUp) continue;
      try {
        const a = getNode(e.a).pos;
        const b = getNode(e.b).pos;
        const mid = new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
        markerGroup.add(new THREE.ArrowHelper(new THREE.Vector3(...e.falseUp), mid, 3.5, 0xff4488, 1.0, 0.6));
      } catch {
        // dangling edge mid-edit
      }
    }
  }

  function rebuild(): void {
    for (const g of [nodeGroup, edgeGroup, wpGroup, labelGroup, markerGroup]) {
      for (let i = g.children.length - 1; i >= 0; i--) g.remove(g.children[i]);
    }
    nodeMeshes.clear();
    for (const n of NODES) {
      const s = n.stretch ?? [1, 1, 1];
      const selected = selection?.kind === 'node' && selection.id === n.id;
      const mat = new THREE.MeshLambertMaterial({
        color: ZONE_COLORS[n.zone],
        transparent: true,
        opacity: n.dry ? 0.6 : 0.42,
        depthWrite: false, // translucent spheres must not occlude tunnel lines (random invisible-line bug, user 2026-07-19)
        emissive: selected ? 0xffffff : 0x000000,
        emissiveIntensity: selected ? 0.35 : 0,
      });
      const m = new THREE.Mesh(sphereGeo, mat);
      m.position.set(...n.pos);
      m.scale.set(n.radius * s[0], n.radius * s[1], n.radius * s[2]);
      m.userData.nodeId = n.id;
      nodeGroup.add(m);
      nodeMeshes.set(n.id, m);
      makeLabel(n.id, n.pos, n.radius * s[1]);
    }
    EDGES.forEach((e, index) => {
      let pts: THREE.Vector3[];
      try {
        pts = [getNode(e.a).pos, ...(e.waypoints ?? []), getNode(e.b).pos].map((p) => new THREE.Vector3(...p));
      } catch {
        return; // dangling edge (mid-edit) — skip drawing
      }
      const selected = selection?.kind === 'edge' && selection.index === index;
      const color = selected ? 0xffee66 : e.door || e.powerGate ? 0xd9534f : WIDTH_COLORS[e.width];
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color, linewidth: 1, transparent: true, opacity: selected ? 1 : 0.85, depthWrite: false }),
      );
      line.frustumCulled = false; // stale bounding spheres culled lines mid-orbit
      line.renderOrder = 1; // draw after the translucent room spheres
      edgeGroup.add(line);
      // invisible fat pickers per segment
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const len = a.distanceTo(b);
        if (len < 0.01) continue;
        // depthWrite/colorWrite OFF: an opacity-0 mesh still writes depth by
        // default, and these fat cylinders hug the line exactly — THAT was the
        // randomly-invisible-tunnel bug (draw order decided whether the picker
        // occluded its own line).
        const picker = new THREE.Mesh(
          new THREE.CylinderGeometry(0.6, 0.6, len, 6),
          new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
        );
        picker.position.copy(a).add(b).multiplyScalar(0.5);
        picker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        picker.userData.edgeIndex = index;
        picker.userData.segIndex = i - 1;
        picker.frustumCulled = false;
        edgeGroup.add(picker);
      }
      // waypoint handles for the selected edge
      if ((selection?.kind === 'edge' && selection.index === index) || (selection?.kind === 'waypoint' && selection.edgeIndex === index)) {
        (e.waypoints ?? []).forEach((w, wpIndex) => {
          const isSel = selection?.kind === 'waypoint' && selection.edgeIndex === index && selection.wpIndex === wpIndex;
          const h = new THREE.Mesh(wpGeo, new THREE.MeshLambertMaterial({ color: isSel ? 0xffffff : 0xff9020 }));
          h.position.set(...w);
          h.userData.edgeIndex = index;
          h.userData.wpIndex = wpIndex;
          wpGroup.add(h);
        });
      }
    });
    rebuildMarkers();
    panel.refresh();
  }

  // ── returning from a playtest (game F4): the unsaved working layout and
  // the editor camera come back exactly as they were (user 2026-07-19) ──
  let restoredFromTest = false;
  try {
    if (sessionStorage.getItem('bw-test-return')) {
      sessionStorage.removeItem('bw-test-return');
      const raw = sessionStorage.getItem('bw-test-layout');
      if (raw) {
        const d = JSON.parse(raw) as { nodes: CaveNode[]; edges: CaveEdge[]; zoneHubs: Record<Zone, string> };
        NODES.length = 0;
        NODES.push(...d.nodes);
        EDGES.length = 0;
        EDGES.push(...d.edges);
        Object.assign(ZONE_HUBS, d.zoneHubs);
        refreshNodeMap();
        restoredFromTest = true;
      }
      const cam = JSON.parse(sessionStorage.getItem('bw-editor-cam') ?? 'null') as { pos: [number, number, number]; target: [number, number, number] } | null;
      if (cam) {
        camera.position.set(...cam.pos);
        orbit.target.set(...cam.target);
      }
    }
  } catch {
    // corrupt stash — start from the saved layout
  }

  // ── undo & persistence ──
  const undoStack: string[] = [];
  const snapshot = (): string => JSON.stringify({ nodes: NODES, edges: EDGES });
  const pushUndo = (): void => {
    undoStack.push(snapshot());
    if (undoStack.length > 60) undoStack.shift();
  };
  pushUndo();
  const restore = (json: string): void => {
    const data = JSON.parse(json) as { nodes: CaveNode[]; edges: CaveEdge[] };
    NODES.length = 0;
    NODES.push(...data.nodes);
    EDGES.length = 0;
    EDGES.push(...data.edges);
    refreshNodeMap();
    selection = null;
    gizmo.detach();
    rebuild();
  };
  const undo = (): void => {
    if (undoStack.length < 2) return;
    undoStack.pop();
    restore(undoStack[undoStack.length - 1]);
    panel.toast('UNDONE');
  };
  // after any committed mutation: refresh lookups, checks, visuals
  let dirty = restoredFromTest;
  const commit = (): void => {
    dirty = true;
    refreshNodeMap();
    pushUndo();
    rebuild();
  };
  window.addEventListener('beforeunload', (e) => {
    if (dirty) e.preventDefault(); // unsaved layout edits → confirm
  });

  const save = async (): Promise<void> => {
    const res = await fetch('/__layout', {
      method: 'POST',
      body: JSON.stringify({ nodes: NODES, edges: EDGES, zoneHubs: ZONE_HUBS }),
    }).catch(() => null);
    if (res?.ok) dirty = false;
    panel.toast(res?.ok ? 'SAVED — reload the game tab to play it' : 'SAVE FAILED (dev server only)');
  };

  const download = (): void => {
    const blob = new Blob([JSON.stringify({ nodes: NODES, edges: EDGES, zoneHubs: ZONE_HUBS }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'layout.json';
    a.click();
  };

  // ── selection & gizmo ──
  // Three gizmo tools on the same TransformControls (user 2026-07-19):
  //  move  — translate the selection (default)
  //  orient — rotation rings drag the selection's falseUp (water tilts along)
  //  water — a single arrow along the room's up drags its water LEVEL
  let gizmoTool: 'move' | 'orient' | 'water' = 'move';
  const selCenter = (): [number, number, number] | null => {
    if (selection?.kind === 'node') return getNode(selection.id).pos;
    if (selection?.kind === 'edge') {
      const e = EDGES[selection.index];
      const a = getNode(e.a).pos;
      const b = getNode(e.b).pos;
      return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    }
    return null;
  };
  const selFalseUp = (): [number, number, number] | undefined => {
    if (selection?.kind === 'node') return getNode(selection.id).falseUp;
    if (selection?.kind === 'edge') return EDGES[selection.index].falseUp;
    return undefined;
  };
  const attachGizmo = (): void => {
    // reset per-tool axis constraints before applying the current tool's
    gizmo.showX = true;
    gizmo.showY = true;
    gizmo.showZ = true;
    gizmo.setSpace('world');
    if (gizmoTool === 'orient' && (selection?.kind === 'node' || selection?.kind === 'edge')) {
      gizmo.setMode('rotate');
      const c = selCenter()!;
      dragProxy.position.set(...c);
      dragProxy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...(selFalseUp() ?? [0, 1, 0])).normalize());
      gizmo.attach(dragProxy);
      return;
    }
    if (gizmoTool === 'water' && selection?.kind === 'node') {
      const pl = roomWaterPlane(getNode(selection.id));
      if (pl) {
        gizmo.setMode('translate');
        gizmo.setSpace('local');
        gizmo.showX = false;
        gizmo.showZ = false; // one arrow: along the room's (false) up
        dragProxy.position.set(...pl.p);
        dragProxy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...pl.up).normalize());
        gizmo.attach(dragProxy);
        return;
      }
    }
    gizmoTool = 'move';
    gizmo.setMode('translate');
    dragProxy.quaternion.identity();
    if (selection?.kind === 'node') {
      dragProxy.position.set(...getNode(selection.id).pos);
      gizmo.attach(dragProxy);
    } else if (selection?.kind === 'waypoint') {
      dragProxy.position.set(...EDGES[selection.edgeIndex].waypoints![selection.wpIndex]);
      gizmo.attach(dragProxy);
    } else {
      gizmo.detach();
    }
  };
  gizmo.addEventListener('objectChange', () => {
    if (gizmoTool === 'orient' && (selection?.kind === 'node' || selection?.kind === 'edge')) {
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(dragProxy.quaternion).normalize();
      const fu: [number, number, number] = [up.x, up.y, up.z];
      if (selection.kind === 'node') getNode(selection.id).falseUp = fu;
      else EDGES[selection.index].falseUp = fu;
      rebuildMarkers(); // live: the water tilts under the rings
      return;
    }
    if (gizmoTool === 'water' && selection?.kind === 'node') {
      const n = getNode(selection.id);
      const up = n.falseUp ?? [0, 1, 0];
      const ry = n.radius * (n.stretch?.[1] ?? 1);
      const d =
        up[0] * (dragProxy.position.x - n.pos[0]) + up[1] * (dragProxy.position.y - n.pos[1]) + up[2] * (dragProxy.position.z - n.pos[2]);
      n.water = Math.round(THREE.MathUtils.clamp((d / ry + 1) / 2, -0.5, 1) * 1000) / 1000;
      rebuildMarkers(); // live: the surface rides the arrow
      return;
    }
    if (selection?.kind === 'node') {
      const n = getNode(selection.id);
      n.pos = [dragProxy.position.x, dragProxy.position.y, dragProxy.position.z];
      const m = nodeMeshes.get(n.id);
      m?.position.copy(dragProxy.position);
      panel.refreshLive();
    } else if (selection?.kind === 'waypoint') {
      EDGES[selection.edgeIndex].waypoints![selection.wpIndex] = [dragProxy.position.x, dragProxy.position.y, dragProxy.position.z];
      panel.refreshLive();
    }
  });

  const select = (sel: Selection): void => {
    selection = sel;
    gizmoTool = 'move'; // new selection always starts in move mode
    attachGizmo();
    rebuild();
  };

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downAt: [number, number] | null = null;
  renderer.domElement.addEventListener('pointerdown', (e) => (downAt = [e.clientX, e.clientY]));
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return; // it was a drag
    if ((gizmo as unknown as { dragging: boolean }).dragging) return;
    pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const wpHit = raycaster.intersectObjects(wpGroup.children, false)[0];
    if (wpHit) {
      select({ kind: 'waypoint', edgeIndex: wpHit.object.userData.edgeIndex as number, wpIndex: wpHit.object.userData.wpIndex as number });
      return;
    }
    const nodeHit = raycaster.intersectObjects(nodeGroup.children, false)[0];
    if (nodeHit) {
      const id = nodeHit.object.userData.nodeId as string;
      if (e.shiftKey && selection?.kind === 'node' && selection.id !== id) {
        // connect (or select the existing tunnel)
        const a = selection.id;
        const existing = EDGES.findIndex((ed) => (ed.a === a && ed.b === id) || (ed.a === id && ed.b === a));
        if (existing >= 0) {
          select({ kind: 'edge', index: existing });
        } else {
          EDGES.push({ a, b: id, width: 'normal' });
          commit();
          select({ kind: 'edge', index: EDGES.length - 1 });
          panel.toast(`TUNNEL ${a} ↔ ${id}`);
        }
        return;
      }
      select({ kind: 'node', id });
      return;
    }
    const edgeHit = raycaster.intersectObjects(edgeGroup.children, false).find((h) => h.object.userData.edgeIndex !== undefined);
    if (edgeHit) {
      select({ kind: 'edge', index: edgeHit.object.userData.edgeIndex as number });
      return;
    }
    select(null);
  });
  renderer.domElement.addEventListener('dblclick', (e) => {
    // Screen-space search, not a raycast: the 0.6 m pickers were nearly
    // impossible to double-click on thin/distant tunnels (user 2026-07-19).
    // Find the tunnel segment closest to the cursor within a pixel budget.
    const px = e.clientX;
    const py = e.clientY;
    const toScreen = (p: [number, number, number], out: THREE.Vector3): boolean => {
      out.set(...p).project(camera);
      return out.z < 1; // in front of the camera
    };
    const sa = new THREE.Vector3();
    const sb = new THREE.Vector3();
    let best: { index: number; segIndex: number; point: [number, number, number]; d2: number } | null = null;
    const MAX_PX = 14;
    EDGES.forEach((edge, index) => {
      let pts: [number, number, number][];
      try {
        pts = [getNode(edge.a).pos, ...(edge.waypoints ?? []), getNode(edge.b).pos];
      } catch {
        return;
      }
      for (let i = 1; i < pts.length; i++) {
        if (!toScreen(pts[i - 1], sa) || !toScreen(pts[i], sb)) continue;
        const ax = ((sa.x + 1) / 2) * window.innerWidth;
        const ay = ((1 - sa.y) / 2) * window.innerHeight;
        const bx = ((sb.x + 1) / 2) * window.innerWidth;
        const by = ((1 - sb.y) / 2) * window.innerHeight;
        const lx = bx - ax;
        const ly = by - ay;
        const len2 = lx * lx + ly * ly;
        const t = len2 < 1e-6 ? 0 : Math.max(0.05, Math.min(0.95, ((px - ax) * lx + (py - ay) * ly) / len2));
        const d2 = (ax + lx * t - px) ** 2 + (ay + ly * t - py) ** 2;
        if (d2 < MAX_PX * MAX_PX && (!best || d2 < best.d2)) {
          const [x0, y0, z0] = pts[i - 1];
          const [x1, y1, z1] = pts[i];
          best = { index, segIndex: i - 1, point: [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t], d2 };
        }
      }
    });
    if (!best) return;
    const { index, segIndex, point } = best;
    const e2 = EDGES[index];
    e2.waypoints = e2.waypoints ?? [];
    e2.waypoints.splice(segIndex, 0, point);
    commit();
    select({ kind: 'waypoint', edgeIndex: index, wpIndex: segIndex });
    panel.toast('WAYPOINT ADDED');
  });

  // ── mutations exposed to the panel ──
  let newRoomCounter = 1;
  const api: PanelApi = {
    getSelection: () => selection,
    select,
    commit,
    undo,
    save: () => void save(),
    download,
    frame: () => {
      if (selection?.kind === 'node') orbit.target.set(...getNode(selection.id).pos);
      else if (selection?.kind === 'edge') {
        const e = EDGES[selection.index];
        const a = getNode(e.a).pos;
        const b = getNode(e.b).pos;
        orbit.target.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
      }
    },
    addRoom: () => {
      let id = `room-${newRoomCounter}`;
      while (NODES.some((n) => n.id === id)) id = `room-${++newRoomCounter}`;
      // zone of the nearest existing room, so new rooms inherit sensibly
      let zone: Zone = 'galleries';
      let best = Infinity;
      for (const n of NODES) {
        const d = Math.hypot(n.pos[0] - orbit.target.x, n.pos[1] - orbit.target.y, n.pos[2] - orbit.target.z);
        if (d < best) {
          best = d;
          zone = n.zone;
        }
      }
      NODES.push({ id, pos: [orbit.target.x, orbit.target.y, orbit.target.z], radius: 2.5, zone, tags: [] });
      commit();
      select({ kind: 'node', id });
      panel.toast(`ROOM ${id} — drag it into place`);
    },
    deleteSelection: () => {
      if (selection?.kind === 'node') {
        const id = selection.id;
        if (Object.values(ZONE_HUBS).includes(id)) {
          panel.toast(`${id} is a zone hub — pick a new hub first (panel → zone hubs)`);
          return;
        }
        for (let i = EDGES.length - 1; i >= 0; i--) if (EDGES[i].a === id || EDGES[i].b === id) EDGES.splice(i, 1);
        const idx = NODES.findIndex((n) => n.id === id);
        if (idx >= 0) NODES.splice(idx, 1);
      } else if (selection?.kind === 'edge') {
        EDGES.splice(selection.index, 1);
      } else if (selection?.kind === 'waypoint') {
        EDGES[selection.edgeIndex].waypoints!.splice(selection.wpIndex, 1);
      } else {
        return;
      }
      select(null);
      commit();
      panel.toast('DELETED');
    },
    duplicateNode: () => {
      if (selection?.kind !== 'node') return;
      const src = getNode(selection.id);
      let id = `${src.id}-copy`;
      while (NODES.some((n) => n.id === id)) id = `${id}2`;
      const clone = JSON.parse(JSON.stringify(src)) as CaveNode;
      clone.id = id;
      clone.pos = [src.pos[0] + src.radius * 2 + 2, src.pos[1], src.pos[2]];
      clone.tags = [];
      clone.contents = undefined;
      NODES.push(clone);
      commit();
      select({ kind: 'node', id });
    },
    renameNode: (oldId, newId) => {
      if (!newId || NODES.some((n) => n.id === newId)) return false;
      getNode(oldId).id = newId;
      for (const e of EDGES) {
        if (e.a === oldId) e.a = newId;
        if (e.b === oldId) e.b = newId;
      }
      for (const z of Object.keys(ZONE_HUBS) as Zone[]) if (ZONE_HUBS[z] === oldId) ZONE_HUBS[z] = newId;
      commit();
      select({ kind: 'node', id: newId });
      return true;
    },
    previewRock: () => {
      panel.toast('GENERATING ROCK…');
      setTimeout(() => {
        if (rockMesh) {
          scene.remove(rockMesh);
          rockMesh.geometry.dispose();
        }
        initSdf();
        const { mesh, genMs } = buildCaveMesh();
        (mesh.material as THREE.MeshStandardMaterial).transparent = true;
        (mesh.material as THREE.MeshStandardMaterial).opacity = 0.92;
        rockMesh = mesh;
        scene.add(mesh);
        panel.toast(`ROCK READY (${(genMs / 1000).toFixed(1)} s) — press again to refresh`);
      }, 30);
    },
    hideRock: () => {
      if (rockMesh) {
        scene.remove(rockMesh);
        rockMesh.geometry.dispose();
        rockMesh = null;
      }
    },
    toggleLabels: () => {
      labelGroup.visible = !labelGroup.visible;
    },
    toggleMarkers: () => {
      markerGroup.visible = !markerGroup.visible;
      panel.toast(markerGroup.visible ? 'WATER / FALSE-UP GIZMOS ON' : 'GIZMOS OFF');
    },
    toggleOrient: () => {
      if (selection?.kind !== 'node' && selection?.kind !== 'edge') {
        panel.toast('SELECT A ROOM OR TUNNEL FIRST');
        return;
      }
      gizmoTool = gizmoTool === 'orient' ? 'move' : 'orient';
      if (gizmoTool === 'orient') markerGroup.visible = true; // you want to SEE what you tilt
      attachGizmo();
      panel.toast(gizmoTool === 'orient' ? 'ORIENT MODE — drag the rings to tilt falseUp (water follows)' : 'MOVE MODE');
    },
    toggleWater: () => {
      if (selection?.kind !== 'node') {
        panel.toast('SELECT A ROOM FIRST');
        return;
      }
      if (gizmoTool === 'water') {
        gizmoTool = 'move';
        attachGizmo();
        panel.toast('MOVE MODE');
        return;
      }
      const n = getNode(selection.id);
      if (!n.dry || n.water === undefined) {
        // make it a half-full air room so there is a surface to grab
        n.dry = true;
        n.water = n.water ?? 0.5;
        commit();
      }
      gizmoTool = 'water';
      markerGroup.visible = true;
      attachGizmo();
      panel.toast('WATER MODE — drag the arrow to set the water level');
    },
    waypointToRoom: () => {
      if (selection?.kind !== 'waypoint') return;
      const index = selection.edgeIndex;
      const e = EDGES[index];
      const wps = e.waypoints ?? [];
      const w = wps[selection.wpIndex];
      if (!w) return;
      let n = 1;
      let id = `turn-${n}`;
      while (NODES.some((x) => x.id === id)) id = `turn-${++n}`;
      // big enough to turn around in — the whole point (user 2026-07-19:
      // squeeze bends are impossible without a turnaround chamber)
      NODES.push({ id, pos: [...w], radius: 2, zone: getNode(e.a).zone, tags: [] });
      const before = wps.slice(0, selection.wpIndex);
      const after = wps.slice(selection.wpIndex + 1);
      const half1 = JSON.parse(JSON.stringify(e)) as CaveEdge;
      const half2 = JSON.parse(JSON.stringify(e)) as CaveEdge;
      half1.b = id;
      half1.waypoints = before.length ? before : undefined;
      half2.a = id;
      half2.waypoints = after.length ? after : undefined;
      // door / gate live on the first half only (no duplicating a door)
      half2.door = undefined;
      half2.powerGate = undefined;
      half2.gateAt = undefined;
      EDGES.splice(index, 1, half1, half2);
      commit();
      select({ kind: 'node', id });
      panel.toast(`${id} — turnaround room splits the tunnel`);
    },
    playtest: () => {
      try {
        sessionStorage.setItem('bw-test-layout', JSON.stringify({ nodes: NODES, edges: EDGES, zoneHubs: ZONE_HUBS }));
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        sessionStorage.setItem('bw-test-cam', JSON.stringify({
          pos: [camera.position.x, camera.position.y, camera.position.z],
          yawDeg: THREE.MathUtils.radToDeg(Math.atan2(-dir.x, -dir.z)),
          pitchDeg: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1))),
        }));
        sessionStorage.setItem('bw-editor-cam', JSON.stringify({
          pos: [camera.position.x, camera.position.y, camera.position.z],
          target: [orbit.target.x, orbit.target.y, orbit.target.z],
        }));
      } catch {
        panel.toast('PLAYTEST STASH FAILED (storage unavailable)');
        return;
      }
      dirty = false; // the layout rides along in sessionStorage — nothing is lost
      location.search = '?debug=1&playtest=1';
    },
  };
  const panel = buildPanel(api);

  window.addEventListener('keydown', (e) => {
    const tag = (document.activeElement?.tagName ?? '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (e.code === 'Delete' || e.code === 'Backspace') api.deleteSelection();
    if (e.code === 'KeyZ' && e.ctrlKey) undo();
    if (e.code === 'KeyF') api.frame();
    if (e.code === 'KeyR') api.toggleOrient();
    if (e.code === 'KeyW') api.toggleWater();
  });
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  rebuild();
  renderer.setAnimationLoop(() => {
    orbit.update();
    renderer.render(scene, camera);
  });

  // scripted-verification harness (same pattern as the game's __bw)
  (window as { __bwEdit?: unknown }).__bwEdit = {
    api,
    select,
    NODES,
    EDGES,
    camera,
    orbit,
    scene,
    gizmo,
    dragProxy,
    rebuild,
    shot: async (name: string): Promise<string> => {
      renderer.render(scene, camera);
      const res = await fetch(`/__shot?name=${encodeURIComponent(name)}`, { method: 'POST', body: renderer.domElement.toDataURL('image/png') });
      return `${name}: ${res.status}`;
    },
  };
}
