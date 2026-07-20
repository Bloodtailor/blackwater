// BLACKWATER — VO/tape/music generation via ElevenLabs (M8b).
//
//   node scripts/generate-vo.mjs            # generate whatever is missing
//   node scripts/generate-vo.mjs --force    # regenerate everything
//   node scripts/generate-vo.mjs --dry      # print the plan, no API calls
//
// Reads the EXACT line text the game subtitles from src/audio/lines.json
// (one source, no drift). Writes:
//   public/audio/vo/<lineId>.mp3      — Lowe (one consistent voice)
//   public/audio/tapes/<tapeId>.mp3   — six crew voices
//   public/audio/manifest.json        — the runtime switches off fallbacks
//                                       the moment this file exists
//   public/music/easteregg/still-on-shift.mp3 — Eleven Music attempt
//                                       (LORE §6 quality gate: LISTEN before
//                                       shipping; delete if it can't carry
//                                       the vocal — the folder plays anything)
//
// Voice casting: set LOWE_VOICE_ID in .env to pin Lowe's voice; otherwise
// the script picks an older American male from your voice library. Tape
// voices rotate through distinct male voices; T6 prefers the calmest one.
// Lowe's direction (LORE §2): soft, unhurried, courteous, aging Midwestern.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FORCE = process.argv.includes('--force');
const DRY = process.argv.includes('--dry');

// ── env ──
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  // values may be quoted (KEY="value") — strip the wrapping, it is not part of the key
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) {
  console.error('ELEVENLABS_API_KEY missing from .env');
  process.exit(1);
}

const LINES = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/audio/lines.json'), 'utf8'));

const api = async (url, opts = {}) => {
  const res = await fetch(`https://api.elevenlabs.io${url}`, {
    ...opts,
    headers: { 'xi-api-key': KEY, ...(opts.body ? { 'content-type': 'application/json' } : {}), ...(opts.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${url} → ${res.status}: ${body.slice(0, 300)}`);
  }
  return res;
};

// ── casting (deliberate, by name — LORE §2 direction; falls back to a
// heuristic if a named voice leaves the library) ──
//   Lowe: the only OLD American male — soft, unhurried, courteous.
//   T6 is cast NEUTRAL and affectless on purpose: the voice is not in the
//   crew book, and it should not quite sit among the men either.
const CAST = {
  lowe: 'Bill',
  t1: 'Adam', // quartermaster — firm, done arguing with the count
  t2: 'Chris', // morale officer — mild, filing it under morale
  t3: 'Eric', // reactor engineer — smooth, enjoys being believed
  t4: 'Brian', // site physician — deep calm, calm failing
  t5: 'Roger', // dive supervisor — flat from re-measuring nine times
  t6: 'River', // the roster reader (void #3 — cast wrong on purpose)
};

async function cast() {
  const { voices } = await (await api('/v1/voices')).json();
  const byName = (n) => voices.find((v) => v.name.split(' ')[0].toLowerCase() === n.toLowerCase());
  const males = voices.filter((v) => (v.labels?.gender ?? '').includes('male') && !(v.labels?.gender ?? '').includes('female'));
  const older = males.filter((v) => /old|middle/.test(v.labels?.age ?? ''));
  const lowe = process.env.LOWE_VOICE_ID
    ? { voice_id: process.env.LOWE_VOICE_ID, name: '(pinned via LOWE_VOICE_ID)' }
    : (byName(CAST.lowe) ?? older.find((v) => /american/.test(v.labels?.accent ?? '')) ?? older[0] ?? males[0] ?? voices[0]);
  const pool = males.filter((v) => v.voice_id !== lowe.voice_id);
  const tapeVoices = {};
  LINES.tapes.forEach((t, i) => {
    tapeVoices[t.id] = byName(CAST[t.id]) ?? pool[i % Math.max(1, pool.length)] ?? lowe;
  });
  return { lowe, tapeVoices };
}

async function tts(voiceId, text, outFile, settings) {
  if (!FORCE && fs.existsSync(outFile)) {
    console.log('  skip (exists)', path.basename(outFile));
    return;
  }
  if (DRY) {
    console.log('  would generate', path.basename(outFile), `"${text.slice(0, 50)}…"`);
    return;
  }
  const res = await api(`/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST',
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.55, similarity_boost: 0.8, style: 0.25, ...settings },
    }),
  });
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, Buffer.from(await res.arrayBuffer()));
  console.log('  wrote', path.basename(outFile));
}

async function music() {
  const out = path.join(ROOT, 'public/music/easteregg/still-on-shift.mp3');
  if (!FORCE && fs.existsSync(out)) return console.log('music: exists, skipping');
  const prompt =
    'Dark melodic hard rock, powerful haunting female lead vocal, aggressive driving verses, soaring mournful minor-key chorus, ' +
    'clean eerie hymn-like bridge with sonar pings and distant water ambience, heavy guitars, cinematic build, ' +
    'outro is a flat spoken voice reading a duty roster underwater, cut off mid-name. Mid-tempo, about 4 minutes. ' +
    'Song title: Still on Shift. Use these lyrics: ' +
    fs.readFileSync(path.join(ROOT, 'LORE.md'), 'utf8').match(/\[Verse 1\][\s\S]*?Calloway—/)?.[0];
  if (DRY) return console.log('music: would attempt Eleven Music');
  try {
    const res = await api('/v1/music?output_format=mp3_44100_128', {
      method: 'POST',
      body: JSON.stringify({ prompt, music_length_ms: 240000 }),
    });
    fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
    console.log('music: wrote still-on-shift.mp3 — LISTEN before shipping (LORE §6 quality gate)');
  } catch (e) {
    console.log('music: Eleven Music attempt failed (fine — the folder plays user-dropped MP3s):', e.message.slice(0, 200));
  }
}

let casting = null;
try {
  casting = await cast();
} catch (e) {
  if (String(e).includes('invalid_api_key') || String(e).includes('401')) {
    console.error('\n⚠  The ELEVENLABS_API_KEY in .env was REJECTED (invalid/rotated).');
    console.error('   Get a fresh key at elevenlabs.io → profile → API keys, update .env,');
    console.error('   then re-run: node scripts/generate-vo.mjs');
    console.error('   (The game runs fully on synth/subtitle fallbacks until then.)\n');
    process.exitCode = 2;
  } else throw e;
}
if (casting) {
  const { lowe, tapeVoices } = casting;
  console.log(`Lowe voice: ${lowe.name ?? lowe.voice_id}`);
  console.log('Lowe lines:', LINES.lowe.length);
  for (const line of LINES.lowe) {
    await tts(lowe.voice_id, line.text, path.join(ROOT, 'public/audio/vo', `${line.id}.mp3`));
  }
  console.log('Tapes:', LINES.tapes.length);
  for (const t of LINES.tapes) {
    const v = tapeVoices[t.id];
    console.log(`  ${t.id} voice: ${v.name ?? v.voice_id} (casting note: ${t.voice})`);
    // tapes read flatter — official paper, one wrongness (LORE §1.3)
    await tts(v.voice_id, t.text, path.join(ROOT, 'public/audio/tapes', `${t.id}.mp3`), { stability: 0.7, style: 0.1 });
  }
  await music();
}

if (!DRY && casting) {
  const manifest = {
    vo: Object.fromEntries(
      LINES.lowe.filter((l) => fs.existsSync(path.join(ROOT, 'public/audio/vo', `${l.id}.mp3`))).map((l) => [l.id, `/audio/vo/${l.id}.mp3`]),
    ),
    tapes: Object.fromEntries(
      LINES.tapes.filter((t) => fs.existsSync(path.join(ROOT, 'public/audio/tapes', `${t.id}.mp3`))).map((t) => [t.id, `/audio/tapes/${t.id}.mp3`]),
    ),
  };
  fs.mkdirSync(path.join(ROOT, 'public/audio'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'public/audio/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`manifest.json: ${Object.keys(manifest.vo).length} vo + ${Object.keys(manifest.tapes).length} tapes`);
}
