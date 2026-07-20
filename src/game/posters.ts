// World posters, notices, prints & perk labels (M8c, LORE §7). Every
// poster-tagged node's contents.poster id becomes a textured quad on the
// rock (SDF wall-mounted like the lockers), with look+E → the fullscreen
// inspect overlay and its REAL-TEXT caption (readability rule: garbled
// pixels can never break comprehension). Perk stations get their G9 label
// as a small plaque beside the station.
//
// G13 (the photograph at the drill head) keeps its bespoke M7 placement in
// main.ts — one image, two uses (LORE §7): the job-sheet enclosure and the
// physical print are the same file, via the same media.ts lookup.

import * as THREE from 'three';
import { NODES, type CaveNode, type PerkId } from '../cave/data';
import { orientToWall, wallSpot } from '../economy/shops';
import type { InteractSystem } from '../economy/interact';
import type { Hud } from '../ui/hud';
import { CAPTIONS, imageUrl } from './media';

// poster id → world size (meters, height) honoring the manifest aspects
const SIZES: Record<string, [number, number]> = {
  G3: [0.62, 0.93],
  G4: [0.62, 0.93],
  G5: [0.62, 0.93],
  G6: [0.62, 0.93],
  G7: [0.62, 0.93],
  G8: [0.45, 0.6],
  G10: [0.9, 0.6],
  G11: [0.75, 0.5],
  G12: [0.9, 0.3],
};

const FILE_IDS: Record<string, string> = {
  G3: 'g3', G4: 'g4', G5: 'g5', G6: 'g6', G7: 'g7', G8: 'g8', G10: 'g10', G11: 'g11', G12: 'g12-sign',
};

export function buildPosters(scene: THREE.Scene, interact: InteractSystem, hud: Hud): void {
  const loader = new THREE.TextureLoader();
  const FIXTURE_TAGS = ['power', 'perk', 'wallBuy', 'boxSpot', 'pap', 'jukebox', 'tape'] as const;
  const place = (n: CaveNode, url: string, w: number, h: number, caption: string, id: string): void => {
    // nodes that already carry a fixture (the breaker, a locker, a station)
    // put their poster on a DIFFERENT wall — wallSpot is deterministic, so
    // without exclude the sheet lands exactly on the fixture (M8c fix)
    const fixture = FIXTURE_TAGS.some((t) => n.tags.includes(t)) ? wallSpot(n).inward.clone().negate() : undefined;
    const spot = wallSpot(n, fixture);
    const g = new THREE.Group();
    const backing = new THREE.Mesh(
      new THREE.PlaneGeometry(w + 0.05, h + 0.05),
      new THREE.MeshStandardMaterial({ color: 0x2e2a22, roughness: 0.9 }),
    );
    g.add(backing);
    const tex = loader.load(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
    sheet.position.z = 0.012;
    g.add(sheet);
    orientToWall(g, spot);
    scene.add(g);
    interact.add({
      id,
      pos: [spot.pos.x, spot.pos.y, spot.pos.z],
      prompt: () => ({ text: hud.inspectOpen ? 'PUT IT BACK' : 'READ', holdSec: 0, enabled: true }),
      execute: () => {
        if (hud.inspectOpen) hud.closeInspect();
        else hud.showInspect(url, caption);
      },
    });
  };

  for (const n of NODES) {
    const poster = n.contents?.poster;
    if (!poster || poster === 'G13') continue; // G13: bespoke M7 placement
    const fileId = FILE_IDS[poster];
    const [w, h] = SIZES[poster] ?? [0.62, 0.93];
    place(n, imageUrl(fileId), w, h, CAPTIONS[fileId.replace('-sign', '')] ?? poster, `poster-${poster}-${n.id}`);
  }

  // perk labels (G9, generated individually): a plaque beside each station
  for (const n of NODES.filter((n) => n.contents?.perk)) {
    const perk = n.contents!.perk as PerkId;
    const spot = wallSpot(n);
    const tex = loader.load(imageUrl(`g9-${perk}`));
    tex.colorSpace = THREE.SRGBColorSpace;
    const plaque = new THREE.Mesh(
      new THREE.PlaneGeometry(0.36, 0.36),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, transparent: true }),
    );
    const g = new THREE.Group();
    plaque.position.set(0.55, 0.15, 0.012); // beside the station, not on it
    g.add(plaque);
    orientToWall(g, spot);
    scene.add(g);
  }
}
