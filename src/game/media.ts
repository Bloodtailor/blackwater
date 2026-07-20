// Diegetic images (M8c, LORE §7). One lookup: imageUrl(id) returns the
// Gemini-generated file when public/images/manifest.json lists it, else a
// PROCEDURAL CANVAS PRINT built here — bold-headline 1960s print ephemera,
// aged paper, stencil type. The fallbacks are mandated (LORE §7: the game
// never blocks on generation quality) and have one real advantage: canvas
// text is LEGIBLE, which AI lettering never reliably is. Any text the player
// must understand also lives in the inspect caption (readability rule).
//
// Generation quota note (2026-07-20): the Gemini key's image quota is 0 —
// image models need BILLING enabled on the Google account. Once it is, run
// `node scripts/generate-images.mjs` and every spot upgrades, zero code.

import { photographDataUrl } from './heart';

let manifest: Record<string, string> | null = null;

export async function loadImageManifest(): Promise<void> {
  try {
    const res = await fetch('/images/manifest.json');
    if (res.ok) manifest = (await res.json()) as Record<string, string>;
  } catch {
    manifest = null;
  }
}

const cache = new Map<string, string>();

/** URL or data-URL for a manifest image id (g1, g3…, g9-<perkId>, g12-sign). */
export function imageUrl(id: string): string {
  const gen = manifest?.[id];
  if (gen) return gen;
  let url = cache.get(id);
  if (!url) {
    url = fallback(id);
    cache.set(id, url);
  }
  return url;
}

/** Inspect captions: the REAL text of each artifact (LORE §7 — comprehension
 *  never depends on pixels). */
export const CAPTIONS: Record<string, string> = {
  g1: 'NAVSITE BLACKWATER — CORMORANT',
  g3: 'YOUR LINE IS YOUR LIFE — LAY IT. TRUST IT.',
  g4: 'SLOW IS SMOOTH — SILT KILLS',
  g5: 'RESPECT THE PILE — PROCEDURE IS PROTECTION',
  g6: 'DRAUGHT RATION IS NOT OPTIONAL',
  g7: 'REQUISITION ROULETTE — ONE PULL PER MAN PER BELL',
  g8: 'MISSING: E. HALVERSEN, LAMP-MAN — LAST SEEN BELOW. (No Halversen appears in the crew book.)',
  g10: 'SITE SCHEMATIC, PRE-FLOOD — built sections surveyed; natural passages marked uncertain. Grease pencil: COLLAPSED. DO NOT USE.',
  g11: 'CREW PHOTOGRAPH, 1966 — quarterly muster, all present. One face circled. No note says why.',
  g12: 'REC ROOM — 1900–2100 — BE A GENTLEMAN',
  g13: 'B-DECK — DRILL HEAD — MARCH 1971',
};

// ── procedural print helpers ──

function paper(w: number, h: number, base = '#b8ab8c'): [CanvasRenderingContext2D, HTMLCanvasElement] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!;
  x.fillStyle = base;
  x.fillRect(0, 0, w, h);
  // offset-print grain
  for (let i = 0; i < w * h * 0.004; i++) {
    x.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
    x.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
  }
  // water stains
  for (let i = 0; i < 5; i++) {
    const g = x.createRadialGradient(Math.random() * w, Math.random() * h, 4, Math.random() * w, Math.random() * h, 30 + Math.random() * (w / 4));
    g.addColorStop(0, 'rgba(80,60,30,0.12)');
    g.addColorStop(1, 'rgba(80,60,30,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
  }
  // worn edges
  x.strokeStyle = 'rgba(40,30,15,0.4)';
  x.lineWidth = 6;
  x.strokeRect(1, 1, w - 2, h - 2);
  return [x, c];
}

function stencil(x: CanvasRenderingContext2D, text: string, cx: number, y: number, size: number, color = '#2b2b26', spacing = 2): void {
  x.save();
  x.font = `bold ${size}px "Arial Black", Arial, sans-serif`;
  x.fillStyle = color;
  x.textAlign = 'center';
  const sp = `${spacing}px`;
  (x as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = sp;
  x.fillText(text, cx, y);
  x.restore();
}

function line(x: CanvasRenderingContext2D, pts: [number, number][], color = '#2b2b26', width = 4): void {
  x.strokeStyle = color;
  x.lineWidth = width;
  x.lineCap = 'round';
  x.beginPath();
  x.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0], pts[i][1]);
  x.stroke();
}

function diverSilhouette(x: CanvasRenderingContext2D, px: number, py: number, s: number, color = '#2b2b26'): void {
  x.fillStyle = color;
  x.beginPath();
  x.ellipse(px, py, s * 1.6, s * 0.55, -0.25, 0, Math.PI * 2); // body
  x.fill();
  x.beginPath();
  x.arc(px + s * 1.7, py - s * 0.65, s * 0.5, 0, Math.PI * 2); // head
  x.fill();
  line(x, [[px - s * 1.4, py + s * 0.3], [px - s * 2.4, py + s * 0.9]], color, s * 0.35); // fin
}

const PERK_STYLE: Record<string, { name: string; color: string }> = {
  barnacleHide: { name: 'BARNACLE HIDE', color: '#2e6e4e' },
  secondWind: { name: 'SECOND WIND', color: '#9fc4d8' },
  greasedGears: { name: 'GREASED GEARS', color: '#c8922a' },
  triggerFish: { name: 'TRIGGER FISH', color: '#b03a2a' },
  deepPockets: { name: 'DEEP POCKETS', color: '#7a5c38' },
  ironLungs: { name: 'IRON LUNGS', color: '#5c666e' },
  catEyes: { name: 'CAT EYES', color: '#d8c02a' },
  finKick: { name: 'FIN KICK', color: '#2a8a8a' },
  steadyHands: { name: 'STEADY HANDS', color: '#cfc9ba' },
};

function fallback(id: string): string {
  if (id === 'g13') return photographDataUrl();
  if (id.startsWith('g9-')) return perkLabel(id.slice(3));
  switch (id) {
    case 'g1': return patch();
    case 'g2': return titleArt();
    case 'g3': return poster('YOUR LINE', 'IS YOUR LIFE', 'LAY IT. TRUST IT.', (x, w, h) => {
      line(x, [[60, h - 180], [w / 2 - 30, h - 260], [w - 70, h - 150]], '#8a2f22', 5);
      diverSilhouette(x, w / 2, h - 300, 26);
    });
    case 'g4': return poster('SLOW IS SMOOTH', 'SILT KILLS', 'FEET UP. FROG KICK.', (x, w, h) => {
      diverSilhouette(x, w / 2 + 20, h - 300, 26);
      x.fillStyle = 'rgba(120,100,60,0.7)';
      x.beginPath();
      x.ellipse(w / 2, h - 170, 190, 46, 0, 0, Math.PI * 2);
      x.fill();
    });
    case 'g5': return poster('RESPECT', 'THE PILE', 'PROCEDURE IS PROTECTION', (x, w, h) => {
      x.fillStyle = '#3d6d8a';
      x.fillRect(w / 2 - 90, h - 360, 180, 190);
      x.fillStyle = '#2b2b26';
      for (let i = 0; i < 4; i++) x.fillRect(w / 2 - 66 + i * 38, h - 400, 14, 60);
    }, '#a9b4ba');
    case 'g6': return poster('DRAUGHT RATION', 'IS NOT OPTIONAL', 'DRINK YOUR ISSUE', (x, w, h) => {
      x.fillStyle = '#8a6b2a';
      x.fillRect(w / 2 - 40, h - 360, 80, 170);
      x.fillStyle = '#c9b98a';
      x.fillRect(w / 2 - 40, h - 360, 80, 34);
      x.beginPath();
      x.arc(w / 2, h - 430, 44, 0, Math.PI * 2);
      x.fillStyle = '#c9a97a';
      x.fill(); // the cheerful face
      x.fillStyle = '#2b2b26';
      x.beginPath();
      x.arc(w / 2 - 14, h - 440, 4, 0, 7);
      x.arc(w / 2 + 14, h - 440, 4, 0, 7);
      x.fill();
      line(x, [[w / 2 - 14, h - 416], [w / 2, h - 408], [w / 2 + 14, h - 416]], '#2b2b26', 3);
    });
    case 'g7': return poster('REQUISITION', 'ROULETTE', 'ONE PULL PER MAN PER BELL', (x, w, h) => {
      x.strokeStyle = '#5c4a2a';
      x.lineWidth = 6;
      for (let i = 0; i < 4; i++) x.strokeRect(w / 2 - 110, h - 380 + i * 34, 220, 22);
      x.fillStyle = '#e8e2d2';
      x.fillRect(w / 2 - 40, h - 250, 34, 34);
      x.fillRect(w / 2 + 8, h - 244, 34, 34);
    });
    case 'g8': return missing();
    case 'g10': return blueprint();
    case 'g11': return crewPhoto();
    case 'g12-face': return jukeFace();
    case 'g12-sign': return recSign();
    default: return poster('SITE', 'BLACKWATER', id.toUpperCase(), () => {});
  }
}

function poster(head1: string, head2: string, sub: string, art: (x: CanvasRenderingContext2D, w: number, h: number) => void, base = '#b8ab8c'): string {
  const [x, c] = paper(400, 600, base);
  stencil(x, head1, 200, 90, 46);
  stencil(x, head2, 200, 148, 46, '#8a2f22');
  art(x, 400, 600);
  stencil(x, sub, 200, 560, 22);
  return c.toDataURL('image/png');
}

function patch(): string {
  const c = document.createElement('canvas');
  c.width = c.height = 400;
  const x = c.getContext('2d')!;
  x.fillStyle = '#1d2a3a';
  x.beginPath();
  x.arc(200, 200, 196, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = '#c8a84a';
  x.lineWidth = 10;
  x.stroke();
  x.beginPath();
  x.arc(200, 200, 150, 0, Math.PI * 2);
  x.stroke();
  // the anglerfish: fat body, jaw, lure over a trident
  x.fillStyle = '#c8a84a';
  line(x, [[130, 260], [200, 130], [270, 260]], '#c8a84a', 8); // trident haft hint
  line(x, [[200, 130], [200, 90]], '#c8a84a', 8);
  x.beginPath();
  x.ellipse(200, 215, 72, 46, 0, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#1d2a3a';
  x.beginPath();
  x.arc(174, 205, 7, 0, Math.PI * 2);
  x.fill(); // eye
  line(x, [[150, 238], [250, 232]], '#1d2a3a', 5); // jaw
  line(x, [[248, 180], [274, 150], [286, 158]], '#c8a84a', 5); // lure stalk
  x.beginPath();
  x.arc(288, 160, 7, 0, Math.PI * 2);
  x.fillStyle = '#e8d8a0';
  x.fill();
  // ring text
  x.fillStyle = '#c8a84a';
  x.font = 'bold 30px Arial, sans-serif';
  x.textAlign = 'center';
  const ring = (txt: string, start: number, dir: 1 | -1, r: number): void => {
    const arc = (txt.length - 1) * 0.115;
    for (let i = 0; i < txt.length; i++) {
      const a = start + dir * (i * 0.115 - arc / 2);
      x.save();
      x.translate(200 + Math.sin(a) * r * dir, 200 - Math.cos(a) * r * dir);
      x.rotate(dir === 1 ? a : Math.PI - a);
      x.fillText(txt[i], 0, 0);
      x.restore();
    }
  };
  ring('NAVSITE BLACKWATER', 0, 1, 172);
  ring('CORMORANT', 0, -1, 172);
  return c.toDataURL('image/png');
}

function titleArt(): string {
  const c = document.createElement('canvas');
  c.width = 960;
  c.height = 540;
  const x = c.getContext('2d')!;
  const bg = x.createLinearGradient(0, 0, 0, 540);
  bg.addColorStop(0, '#0d2b30');
  bg.addColorStop(0.35, '#07181d');
  bg.addColorStop(1, '#020608');
  x.fillStyle = bg;
  x.fillRect(0, 0, 960, 540);
  // the shaft of daylight
  const beam = x.createLinearGradient(0, 0, 0, 460);
  beam.addColorStop(0, 'rgba(160,220,210,0.5)');
  beam.addColorStop(1, 'rgba(160,220,210,0)');
  x.fillStyle = beam;
  x.beginPath();
  x.moveTo(430, 0);
  x.lineTo(530, 0);
  x.lineTo(640, 470);
  x.lineTo(330, 470);
  x.closePath();
  x.fill();
  // motes in the beam
  for (let i = 0; i < 130; i++) {
    x.fillStyle = `rgba(190,230,220,${0.06 + Math.random() * 0.1})`;
    const t = Math.random();
    x.fillRect(430 + (Math.random() - 0.2) * 200 * (0.4 + t), t * 460, 2, 2);
  }
  // the tiny diver, descending
  diverSilhouette(x, 480, 330, 9, '#04090b');
  return c.toDataURL('image/png');
}

function missing(): string {
  const [x, c] = paper(360, 480, '#cfc6ae');
  stencil(x, 'MISSING', 180, 84, 58, '#2b2b26', 6);
  x.fillStyle = '#8a8676';
  x.fillRect(110, 120, 140, 170);
  x.fillStyle = '#5c584a';
  x.beginPath();
  x.arc(180, 180, 34, 0, Math.PI * 2);
  x.fill();
  x.beginPath();
  x.ellipse(180, 268, 52, 40, 0, Math.PI, 0);
  x.fill();
  stencil(x, 'E. HALVERSEN, LAMP-MAN', 180, 340, 22);
  stencil(x, 'LAST SEEN BELOW', 180, 380, 22, '#8a2f22');
  x.font = '15px Georgia, serif';
  x.fillStyle = '#55503f';
  x.textAlign = 'center';
  x.fillText('Report any sighting to the watch officer.', 180, 430);
  return c.toDataURL('image/png');
}

function blueprint(): string {
  const c = document.createElement('canvas');
  c.width = 600;
  c.height = 400;
  const x = c.getContext('2d')!;
  x.fillStyle = '#16324a';
  x.fillRect(0, 0, 600, 400);
  x.strokeStyle = 'rgba(220,235,245,0.9)';
  x.lineWidth = 2;
  // the built site: clean boxes down the left, the bore straight down
  x.strokeRect(60, 60, 120, 40); // berthing
  x.strokeRect(90, 130, 120, 40); // stores
  x.strokeRect(120, 200, 90, 60); // the pile
  line(x, [[300, 40], [300, 360]], 'rgba(220,235,245,0.9)', 3); // THERMAL-1 bore
  x.font = '13px Consolas, monospace';
  x.fillStyle = 'rgba(220,235,245,0.9)';
  x.fillText('BERTHING', 66, 84);
  x.fillText('STORES', 96, 154);
  x.fillText('PILE', 128, 232);
  x.fillText('THERMAL-1', 308, 200);
  // natural cave: dashed, uncertain
  x.setLineDash([7, 7]);
  x.strokeStyle = 'rgba(200,215,225,0.55)';
  line(x, [[180, 80], [420, 110], [520, 90]], 'rgba(200,215,225,0.55)', 2);
  line(x, [[210, 150], [430, 210], [540, 190]], 'rgba(200,215,225,0.55)', 2);
  line(x, [[300, 360], [430, 330], [520, 350]], 'rgba(200,215,225,0.55)', 2);
  x.setLineDash([]);
  x.font = 'bold 16px Consolas, monospace';
  x.fillText('?', 445, 105);
  x.fillText('?', 455, 205);
  x.fillText('?', 470, 340);
  // grease pencil
  x.font = 'italic bold 18px Georgia, serif';
  x.fillStyle = '#e8d060';
  x.fillText('COLLAPSED', 350, 250);
  x.fillText('DO NOT USE', 400, 140);
  x.fillStyle = 'rgba(220,235,245,0.7)';
  x.font = '12px Consolas, monospace';
  x.fillText('SITE BLACKWATER — SCHEMATIC — MISSION ¶ REDACTED', 60, 380);
  return c.toDataURL('image/png');
}

function crewPhoto(): string {
  const c = document.createElement('canvas');
  c.width = 600;
  c.height = 400;
  const x = c.getContext('2d')!;
  x.fillStyle = '#c9c4b4';
  x.fillRect(0, 0, 600, 400);
  x.fillStyle = '#8e8a7c';
  x.fillRect(20, 20, 560, 330);
  // platform + water
  x.fillStyle = '#54514a';
  x.fillRect(20, 280, 560, 70);
  x.fillStyle = '#3a3d3c';
  x.fillRect(20, 320, 560, 30);
  // rows of men — deliberately hard to count (LORE: nobody counts it the same twice)
  let drawn = 0;
  for (let row = 0; row < 3; row++) {
    const y = 200 + row * 38;
    const n = 13 + row;
    for (let i = 0; i < n; i++) {
      const px = 60 + (i * 490) / n + (Math.random() - 0.5) * 8;
      x.fillStyle = `rgba(40,38,30,${0.75 + Math.random() * 0.25})`;
      x.beginPath();
      x.arc(px, y - 22, 9, 0, Math.PI * 2);
      x.fill();
      x.fillRect(px - 8, y - 12, 16, 26);
      drawn++;
    }
  }
  // the grease-pencil circle, middle rows
  x.strokeStyle = '#d8c860';
  x.lineWidth = 3;
  x.beginPath();
  x.ellipse(305, 212, 16, 20, 0.2, 0, Math.PI * 2);
  x.stroke();
  x.fillStyle = '#55503f';
  x.font = '13px Georgia, serif';
  x.fillText('Quarterly muster, 1966 — all present.', 30, 375);
  return c.toDataURL('image/png');
}

function jukeFace(): string {
  const c = document.createElement('canvas');
  c.width = c.height = 400;
  const x = c.getContext('2d')!;
  x.fillStyle = '#3d2b1c';
  x.fillRect(0, 0, 400, 400);
  x.strokeStyle = '#c9b078';
  x.lineWidth = 14;
  x.beginPath();
  x.arc(200, 210, 150, Math.PI, 0);
  x.stroke();
  x.fillStyle = '#e8c060';
  x.fillRect(90, 230, 220, 70);
  x.fillStyle = '#3d2b1c';
  for (let i = 0; i < 6; i++) x.fillRect(104 + i * 36, 246, 24, 38);
  x.fillStyle = '#c9b078';
  x.font = 'bold 22px Arial, sans-serif';
  x.textAlign = 'center';
  x.fillText('WURLANDER 1966', 200, 340);
  return c.toDataURL('image/png');
}

function recSign(): string {
  const [x, c] = paper(600, 200, '#7a6b4a');
  stencil(x, 'REC ROOM — 1900–2100', 300, 90, 40, '#e8e2d2', 3);
  stencil(x, 'BE A GENTLEMAN', 300, 150, 34, '#e8e2d2', 5);
  return c.toDataURL('image/png');
}

// ── toy-diver polaroids (user 2026-07-20): filed to the pause-menu gallery
// when a tin diver is wound. Mundane caption, one wrongness each. ──

const TOY_PHOTO = [
  { color: '#a03028', name: 'RED', note: 'Gallery spur, dead end. The key was already warm.' },
  { color: '#2a4f9e', name: 'BLUE', note: 'Maze, low shelf. It faced the door before I did.' },
  { color: '#c9a72c', name: 'YELLOW', note: 'Below. Tin should not survive that depth.' },
];

export const TOY_CAPTIONS = TOY_PHOTO.map((t) => `TIN DIVER — ${t.name} — ${t.note}`);

export function toyPhotoDataUrl(i: number): string {
  const t = TOY_PHOTO[i] ?? TOY_PHOTO[0];
  const key = `toy-photo-${i}`;
  const hit = cache.get(key);
  if (hit) return hit;
  // a polaroid: white frame, murky flash-lit photo, pencil note
  const c = document.createElement('canvas');
  c.width = 360;
  c.height = 420;
  const x = c.getContext('2d')!;
  x.fillStyle = '#e8e4da';
  x.fillRect(0, 0, 360, 420);
  // photo area — flash falloff in dark water
  const g = x.createRadialGradient(180, 170, 30, 180, 170, 210);
  g.addColorStop(0, '#3d5a58');
  g.addColorStop(1, '#0a1414');
  x.fillStyle = g;
  x.fillRect(20, 20, 320, 320);
  // silt motes in the flash
  for (let i2 = 0; i2 < 60; i2++) {
    x.fillStyle = `rgba(200,220,210,${0.05 + Math.random() * 0.12})`;
    x.fillRect(20 + Math.random() * 320, 20 + Math.random() * 320, 2, 2);
  }
  // the tin diver: body, brass helm, wind-up key
  x.fillStyle = t.color;
  x.fillRect(150, 160, 60, 110); // body
  x.fillStyle = 'rgba(0,0,0,0.25)';
  x.fillRect(196, 160, 14, 110); // shading
  x.fillStyle = '#b8a25a';
  x.beginPath();
  x.arc(180, 140, 34, 0, Math.PI * 2); // helm
  x.fill();
  x.fillStyle = '#1a2a28';
  x.beginPath();
  x.arc(180, 140, 18, 0, Math.PI * 2); // faceplate — nothing readable inside
  x.fill();
  x.strokeStyle = '#b8a25a';
  x.lineWidth = 6;
  line(x, [[210, 200], [244, 200]], '#b8a25a', 6); // key shaft
  x.strokeRect(244, 184, 10, 32); // key bow
  x.fillStyle = t.color;
  x.fillRect(138, 262, 34, 16); // little boots
  x.fillRect(188, 262, 34, 16);
  // pencil note on the frame
  x.font = 'italic 19px Georgia, serif';
  x.fillStyle = '#4a4438';
  x.textAlign = 'center';
  x.fillText(`the ${t.name.toLowerCase()} one — ${t.note.split('.')[0].toLowerCase()}.`, 180, 372);
  const url = c.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

function perkLabel(perkId: string): string {
  const s = PERK_STYLE[perkId] ?? { name: perkId.toUpperCase(), color: '#888' };
  const c = document.createElement('canvas');
  c.width = c.height = 300;
  const x = c.getContext('2d')!;
  x.fillStyle = '#d8cfb8';
  x.beginPath();
  x.arc(150, 150, 146, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = s.color;
  x.lineWidth = 16;
  x.stroke();
  x.beginPath();
  x.arc(150, 150, 108, 0, Math.PI * 2);
  x.strokeStyle = '#2b2b26';
  x.lineWidth = 3;
  x.stroke();
  // arc name
  x.fillStyle = '#2b2b26';
  x.font = 'bold 26px Arial, sans-serif';
  x.textAlign = 'center';
  const arc = (s.name.length - 1) * 0.135;
  for (let i = 0; i < s.name.length; i++) {
    const a = i * 0.135 - arc / 2;
    x.save();
    x.translate(150 + Math.sin(a) * 122, 150 - Math.cos(a) * 122);
    x.rotate(a);
    x.fillText(s.name[i], 0, 0);
    x.restore();
  }
  // central motif: a filled emblem circle in the perk color + NHP small print
  x.fillStyle = s.color;
  x.beginPath();
  x.arc(150, 150, 52, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#d8cfb8';
  x.font = 'bold 34px Georgia, serif';
  x.fillText(s.name.split(' ').map((w) => w[0]).join(''), 150, 162);
  x.fillStyle = '#55503f';
  x.font = '13px Consolas, monospace';
  x.fillText('NHP-SERIES DRAUGHT', 150, 236);
  return c.toDataURL('image/png');
}
