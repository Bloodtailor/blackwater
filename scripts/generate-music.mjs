// BLACKWATER — music generation via Eleven Music (user 2026-07-20):
//   • jukebox songs → public/music/easteregg/ (the folder IS the playlist)
//   • menu theme    → public/music/menu-theme.mp3 (title/pause screens)
//   • the lull      → public/music/lull.mp3 (~1 min calm-but-sinister piece
//                     that plays after a long stretch with no dialog)
//
//   node scripts/generate-music.mjs            # generate whatever is missing
//   node scripts/generate-music.mjs --force    # regenerate everything
//   node scripts/generate-music.mjs --only lull,menu-theme
//
// LORE §6 quality gate applies to every track: LISTEN before shipping;
// delete any file you don't like (jukebox skips missing files, the menu and
// lull simply stay silent).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FORCE = process.argv.includes('--force');
const onlyArg = process.argv.find((a) => a.startsWith('--only'));
const ONLY = onlyArg ? process.argv[process.argv.indexOf(onlyArg) + 1]?.split(',') : null;

for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) {
  console.error('ELEVENLABS_API_KEY missing from .env');
  process.exit(1);
}

// name → { out, ms, prompt } — 1966 rec-room 45s for the jukebox (each with
// exactly one quiet wrongness, per the lore's horror-engine rule), plus the
// two game cues.
const TRACKS = {
  'menu-theme': {
    out: 'public/music/menu-theme.mp3',
    ms: 95000,
    prompt:
      'Dark ambient title-screen theme for a 1970s underwater horror game: slow low strings and a deep drone, ' +
      'sparse lonely piano notes that never resolve, distant sonar pings, faint water drips echoing in a cave, ' +
      'tape-worn and patient, quietly ominous, no drums, instrumental only, loopable, about 90 seconds.',
  },
  lull: {
    out: 'public/music/lull.mp3',
    ms: 60000,
    prompt:
      'A one-minute calm but sinister instrumental interlude: a soft slightly detuned music box over a low cello drone, ' +
      'heard as if underwater, sparse notes with long gaps, gentle on the surface with creeping dread underneath, ' +
      'very quiet dynamics, no percussion, no climax, instrumental only, about 60 seconds.',
  },
  'moonlight-at-the-waterline': {
    out: 'public/music/easteregg/moonlight-at-the-waterline.mp3',
    ms: 165000,
    prompt:
      '1960s slow-dance doo-wop ballad, warm male crooner with backing harmonies, gentle piano triplets, soft brushed drums, ' +
      'vintage AM-radio warmth and tape hiss; lyrics about waiting at the waterline for a diver who is running late, ' +
      'tender and romantic on the surface with one faintly eerie line about the water keeping what it likes. ' +
      'About 2 minutes 40 seconds. Song title: Moonlight at the Waterline.',
  },
  'the-cormorant-twist': {
    out: 'public/music/easteregg/the-cormorant-twist.mp3',
    ms: 140000,
    prompt:
      'Upbeat 1960s surf-rock instrumental: twangy reverb-drenched electric guitar lead, driving drums, walking bass, ' +
      'cheeky organ stabs, rec-room jukebox 45 energy, recorded slightly worn with wow and flutter, ' +
      'one subtly detuned guitar note recurring in the main riff. Instrumental, no vocals. About 2 minutes 20 seconds. ' +
      'Song title: The Cormorant Twist.',
  },
  'forty-one-forty-two': {
    out: 'public/music/easteregg/forty-one-forty-two.mp3',
    ms: 160000,
    prompt:
      'Late-1960s soul ballad, smooth male vocal group with warm horns, vibraphone and a slow swaying groove; ' +
      'lyrics fondly counting a work crew coming home one by one at the end of a shift, sweet and nostalgic, ' +
      'and the final count lands one higher than the crew without anyone in the song remarking on it. ' +
      'About 2 minutes 40 seconds. Song title: Forty-One, Forty-Two.',
  },
};

const api = async (url, body) => {
  const res = await fetch(`https://api.elevenlabs.io${url}`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 250)}`);
  return Buffer.from(await res.arrayBuffer());
};

let made = 0;
let failed = 0;
for (const [name, def] of Object.entries(TRACKS)) {
  if (ONLY && !ONLY.includes(name)) continue;
  const file = path.join(ROOT, def.out);
  if (!FORCE && fs.existsSync(file)) {
    console.log('skip (exists)', name);
    continue;
  }
  try {
    console.log('generating', name, `(${(def.ms / 1000) | 0}s)…`);
    const buf = await api('/v1/music?output_format=mp3_44100_128', { prompt: def.prompt, music_length_ms: def.ms });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buf);
    made++;
    console.log('wrote', def.out, `(${(buf.length / 1024) | 0} KB)`);
  } catch (e) {
    failed++;
    console.error('FAILED', name, '—', String(e).slice(0, 250));
  }
}
console.log(`done: ${made} generated, ${failed} failed. LISTEN before shipping (LORE §6 gate).`);
if (failed > 0) process.exitCode = 1;
