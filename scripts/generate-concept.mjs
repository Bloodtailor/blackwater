// BLACKWATER — Concept Gallery generation via Gemini (LORE §7.1, C1–C12).
//
//   node scripts/generate-concept.mjs            # generate whatever is missing
//   node scripts/generate-concept.mjs --force    # regenerate everything
//   node scripts/generate-concept.mjs --only c6,c7
//
// Writes public/images/concept/<id>.png + public/images/concept/manifest.json.
// These are concept PAINTINGS of the game itself (menus only, never in-world)
// — a different register from generate-images.mjs's period print ephemera.
// The runtime Concept Gallery shows a procedural FILM UNDEVELOPED frame for
// any missing entry, so this script can fail partially with zero breakage.

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
  ' Digital concept art painting, cinematic, murky underwater palette with one warm accent, loose confident brushwork, film-still composition, no text, no watermark.';

// id → { title, p: prompt, ar: aspect ratio } — LORE §7.1 manifest, verbatim subjects
const PIECES = {
  c1: { title: 'The Camp', ar: '16:9', p: 'A lone recovery diver\'s camp at dusk on the rock lip of a vast karst sinkhole: a work truck with a winch, one tarp shelter, gear crates, a single work lamp — and below, a perfectly black pool of still water waiting. 2008-mundane equipment against ancient stone.' },
  c2: { title: 'First Descent', ar: '2:3', p: 'Seen from deep underwater looking up: a narrow shaft of daylight cutting down through black water, and one small diver silhouette descending along a thin white guide line, dwarfed by the dark around the beam.' },
  c3: { title: 'The Galleries', ar: '16:9', p: 'A flooded 1960s naval berthing space fused into natural cave: bunk alcoves half-swallowed by flowstone, a cork notice board with curling papers, one caged string light burning blue-white in green murk.' },
  c4: { title: 'The Drowned', ar: '16:9', p: 'Three drowned crewmen in 1968 denim work gear and tool belts drift-walking down a flooded stone corridor toward the viewer, faces softened by forty years of water, postures calm and procedural, lit only by a distant lamp behind them.' },
  c5: { title: 'The Maze', ar: '16:9', p: 'A junction of four identical flooded limestone passages receding into darkness, one chalk arrow drawn on stone, one thin white guide line vanishing into the leftmost tunnel, silt hanging motionless in a flashlight beam.' },
  c6: { title: 'The Angler', ar: '16:9', p: 'A single warm lamp glowing in absolute black water, and behind it, barely suggested at the very edge of visibility, the enormous pressure of a body — a suggestion of jaw and fin, never resolved. The lamp is the only warm thing in the frame.' },
  c7: { title: 'The Lamp Man', ar: '2:3', p: 'Far down a flooded stone tunnel, a human figure stands perfectly upright on the floor, motionless, holding a warm lamp at chest height. He is exactly vertical while the tunnel tilts. Too distant to see a face. The composition makes standing itself feel wrong underwater.' },
  c8: { title: 'The Bore', ar: '2:3', p: 'Looking straight down a vertical drilled shaft lined with rusted scaffold rings and guide chains, descending past all light into black, a few rising bubbles catching a headlamp beam at the rim.' },
  c9: { title: 'The Guardians', ar: '16:9', p: 'Two massive brass Mark V atmospheric diving suits standing post at an abandoned underwater drill head, hose stubs severed, stencils scraped off their bells, floodlamp stands dead around them, faint cyan bioluminescence dusting the cavern behind.' },
  c10: { title: 'The Heart', ar: '16:9', p: 'A cathedral-scale flooded cavern apse where a slow warm pulse glows inside translucent flowstone — organic and ambiguous, amber light bleeding into cold black water, the rock around it grown strange and smooth.' },
  c11: { title: 'The Ascent', ar: '2:3', p: 'A diver rising desperately up a flooded vertical shaft clutching a warm glowing mass to his chest, its light streaming past him into the dark below, where the black is boiling with rising figures. Daylight is a coin-sized promise far above.' },
  c12: { title: 'The Annex', ar: '16:9', p: 'A pristine, warmly lit museum room impossibly kept inside a cave: polished poured floor, brass rails, glass display cases holding diving gear and tin toys, framed photographs, and on a stand in the center a large guarded red button. Every light works. Nothing explains it.' },
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

const outDir = path.join(ROOT, 'public/images/concept');
fs.mkdirSync(outDir, { recursive: true });
let made = 0;
let failed = 0;
for (const [id, def] of Object.entries(PIECES)) {
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
    console.log('wrote', id, def.title, `(${(buf.length / 1024) | 0} KB)`);
  } catch (e) {
    failed++;
    console.error('FAILED', id, '—', String(e).slice(0, 200));
  }
}

// manifest: id → { title, url } for every piece; url null when not generated
// (the gallery shows FILM UNDEVELOPED for null — LORE §7.1)
const manifest = {};
for (const [id, def] of Object.entries(PIECES)) {
  manifest[id] = {
    title: def.title,
    url: fs.existsSync(path.join(outDir, `${id}.png`)) ? `/images/concept/${id}.png` : null,
  };
}
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`done: ${made} generated, ${failed} failed, manifest entries: ${Object.keys(manifest).length}`);
if (failed > 0) process.exitCode = 1;
