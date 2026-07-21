// BLACKWATER — diegetic image generation via Gemini (M8c, LORE §7 manifest).
//
//   node scripts/generate-images.mjs            # generate whatever is missing
//   node scripts/generate-images.mjs --force    # regenerate everything
//   node scripts/generate-images.mjs --only g3,g9-catEyes
//
// Writes public/images/<id>.png + public/images/manifest.json. The runtime
// (src/game/media.ts) uses a generated file when the manifest lists it and
// falls back to its procedural canvas print otherwise — delete a file you
// dislike and that one spot reverts to the fallback (LORE §7: the game never
// blocks on generation quality; readable TEXT lives in the inspect captions,
// never in the pixels).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FORCE = process.argv.includes('--force');
const onlyArg = process.argv.indexOf('--only');
const ONLY = onlyArg >= 0 ? process.argv[onlyArg + 1]?.split(',') : null;

for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.IMAGE_MODEL ?? 'gemini-2.5-flash-image';

const STYLE =
  ' 1960s US Navy print ephemera, offset-print grain, aged and water-stained, muted period palette, worn edges, no modern typography, no watermarks.';

const PERKS = {
  barnacleHide: ['BARNACLE HIDE', 'a cluster of barnacles on a shell plate', 'deep sea green'],
  secondWind: ['SECOND WIND', 'a spiral of rising bubbles', 'pale ice blue'],
  greasedGears: ['GREASED GEARS', 'two meshed gears dripping oil', 'amber'],
  triggerFish: ['TRIGGER FISH', 'an aggressive little fish mid-strike', 'signal red'],
  deepPockets: ['DEEP POCKETS', 'a canvas dive satchel with three straps', 'canvas brown'],
  ironLungs: ['IRON LUNGS', 'a riveted twin air tank', 'gunmetal grey'],
  catEyes: ['CAT EYES', 'a wide reflective eye in the dark', 'lamp yellow'],
  finKick: ['FIN KICK', 'a single swim fin kicking a wake', 'teal'],
  steadyHands: ['STEADY HANDS', 'a flat calm open hand over still water', 'bone white'],
};

// id → { p: prompt, ar: aspect ratio }
const IMAGES = {
  g1: { ar: '1:1', p: 'Circular embroidered military patch: an anglerfish curled around a trident, ring text around the edge reading "NAVSITE BLACKWATER" and "CORMORANT". Naval insignia style, dark navy and gold thread.' },
  g2: { ar: '16:9', p: 'Dramatic key art painting: a vast dark sinkhole seen from inside, one narrow shaft of daylight cutting down through black water to a tiny lone diver descending into the dark. Vertigo, awe, cold. Painterly, muted teal and black.' },
  g3: { ar: '2:3', p: 'Safety poster, bold headline dominating the top: "YOUR LINE IS YOUR LIFE" and smaller "LAY IT. TRUST IT." — a simple instructional diagram of a diver following a guide line through a cave passage. High contrast, big type, minimal body text.' },
  g4: { ar: '2:3', p: 'Safety poster, bold headline: "SLOW IS SMOOTH" and "SILT KILLS" — instructional diagram of correct frog-kick fin technique above a silty cave floor, wrong technique crossed out. High contrast, big type.' },
  g5: { ar: '2:3', p: 'Reactor safety poster, bold headline: "RESPECT THE PILE" and "PROCEDURE IS PROTECTION" — a stylized reactor pictogram with control rods, single blue accent color on an otherwise grey poster. Stern, official.' },
  g6: { ar: '2:3', p: 'Cheerful naval propaganda poster, bold headline: "DRAUGHT RATION IS NOT OPTIONAL" — a smiling 1960s sailor holding up a small brass-and-glass canister of dark liquid. Slightly uncanny cheerfulness.' },
  g7: { ar: '2:3', p: 'Rec-room notice poster, bold headline: "REQUISITION ROULETTE" and "ONE PULL PER MAN PER BELL" — a slatted wooden supply crate with a pair of dice on it. Hand-painted look.' },
  g8: { ar: '3:4', p: 'A small typed MISSING notice pinned to a board, curling at the corners: large type "MISSING" over a small blurry ID photograph of a man, text lines reading "E. HALVERSEN, LAMP-MAN" and "LAST SEEN BELOW". Sparse, unsettling, bureaucratic.' },
  ...Object.fromEntries(
    Object.entries(PERKS).map(([id, [name, motif, color]]) => [
      `g9-${id}`,
      { ar: '1:1', p: `Round vintage product label for a naval "performance draught" canister: bold arc text "${name}", central emblem of ${motif}, dominant cap color ${color}, small print too weathered to read. Apothecary-meets-military style.` },
    ]),
  ),
  g10: { ar: '3:2', p: 'Engineering blueprint of an underground naval site built down a flooded sinkhole: precise white linework on blue for the built structures (berthing, stores, reactor pit, a vertical bore), but the natural cave passages drawn hand-sketched, dotted, with question marks and grease-pencil annotations reading "COLLAPSED" and "DO NOT USE". The map is honest about what it does not know.' },
  g11: { ar: '3:2', p: 'A 1966 black-and-white group photograph: a few dozen men in diving and work gear posed on a wooden platform at the edge of dark water inside a cavern, harsh flash lighting. One face in the middle rows is circled in grease pencil. Slightly overexposed, silver-print grain.' },
  'g12-face': { ar: '1:1', p: 'The chrome-and-walnut faceplate of a 1966 jukebox: bubble arch, selection buttons, warm backlit panel, water-stained but intact.' },
  // NOTE: the image API only allows 1:1/1:4/1:8/2:3/3:2/3:4/4:3/4:1/8:1/16:9/9:16-family
  // ratios — 3:1 is rejected (probed 2026-07-21); 21:9 is the widest supported shape
  'g12-sign': { ar: '21:9', p: 'A painted wooden rec-room sign, bold stenciled text: "REC ROOM — 1900–2100 — BE A GENTLEMAN". Chipped paint, navy stencil style.' },
  g13: { ar: '3:2', p: 'A photograph taken with a harsh flash inside a flooded cave chamber: empty dark water, rough rock walls, and mid-frame a faint warm glowing mass inside translucent flowstone. A processing stamp in the corner reads 1971. Unsettling emptiness, silver-print artifact.' },
};

async function generate(id, def) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: def.p + STYLE }] }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: def.ar } },
    }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 250)}`);
  const j = await res.json();
  const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new Error(`no image in response: ${JSON.stringify(j).slice(0, 200)}`);
  return Buffer.from(part.inlineData.data, 'base64');
}

const outDir = path.join(ROOT, 'public/images');
fs.mkdirSync(outDir, { recursive: true });
let made = 0;
let failed = 0;
for (const [id, def] of Object.entries(IMAGES)) {
  if (ONLY && !ONLY.includes(id)) continue;
  const file = path.join(outDir, `${id}.png`);
  if (!FORCE && fs.existsSync(file)) {
    console.log('skip (exists)', id);
    continue;
  }
  try {
    const buf = await generate(id, def);
    fs.writeFileSync(file, buf);
    made++;
    console.log('wrote', id, `(${(buf.length / 1024) | 0} KB)`);
  } catch (e) {
    failed++;
    console.error('FAILED', id, '—', String(e).slice(0, 200));
  }
}

const manifest = {};
for (const id of Object.keys(IMAGES)) {
  if (fs.existsSync(path.join(outDir, `${id}.png`))) manifest[id] = `/images/${id}.png`;
}
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`done: ${made} generated, ${failed} failed, manifest entries: ${Object.keys(manifest).length}`);
if (failed > 0) process.exitCode = 1;
