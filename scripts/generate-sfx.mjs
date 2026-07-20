// BLACKWATER — full SFX generation via the ElevenLabs sound-effects endpoint.
//
//   node scripts/generate-sfx.mjs            # generate whatever is missing
//   node scripts/generate-sfx.mjs --force    # regenerate everything
//   node scripts/generate-sfx.mjs --only gun-speargun,moan-1   # cherry-pick
//
// Writes public/audio/sfx/<name>.mp3 and merges an `sfx` section into
// public/audio/manifest.json. The runtime SampleBank (src/audio/samples.ts)
// plays these through the M8a buses; any missing/deleted file silently falls
// back to the M8a synth voice for that sound — per-sound quality gate, as the
// plan requires. Delete a file you don't like and the synth covers it.
//
// Prompt style notes (sound design intent):
//  - everything below the waterline is asked for "underwater / muffled / wet"
//    so the source material already sits in the world BEFORE the global
//    low-pass — layered wetness reads better than filtering alone
//  - one-shots ask for a single event, tight transient, no music unless the
//    sound IS music (stingers/jingles per DESIGN §14 are original motifs)
//  - loops ask for "seamless loop" and get loop=true

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

// name → { p: prompt, sec: duration, loop?: true }
const SFX = {
  // ── weapons (one voice per family; the game adds the PaP zing) ──
  'gun-wristDart': { p: 'Small underwater dart pistol firing once: sharp compressed-air snap, tight transient, brief wet fizz tail, muffled by water, close. Single shot, no music.', sec: 1.0 },
  'gun-pneuDriver': { p: 'Compact pneumatic underwater nail driver firing one dart: quick metallic tick with a small air puff, very short and punchy, wet muffled. Single shot, no music.', sec: 0.7 },
  'gun-speargun': { p: 'Powerful speargun firing underwater: deep rubbery thunk, band release snap, spear whooshing away through water, short wet reverb tail. Single shot, no music.', sec: 1.4 },
  'gun-flechette': { p: 'Underwater shotgun blast: heavy muffled boom, cloud of small darts hissing through water, deep low end, bubbles settling. Single shot, no music.', sec: 1.6 },
  'gun-harpoon': { p: 'Massive harpoon cannon firing underwater: enormous deep concussive thud, steel cable whipping, long low rumble decaying through dark water. Single shot, no music.', sec: 2.0 },
  'gun-arcProjector': { p: 'Electric arc weapon discharging underwater: crackling electricity zap, sizzling boiling bubbles, bright electric buzz decaying fast. Single discharge, no music.', sec: 1.4 },
  'gun-vortexMaw': { p: 'Underwater vortex cannon firing: swirling suction whoosh rising in pitch then a water-rushing implosion collapse. Single shot, no music.', sec: 1.6 },
  'gun-sonicLance': { p: 'Sonic beam weapon underwater: focused resonant pressure pulse, deep piercing tone burst with a metallic ring, muffled by water. Single shot, no music.', sec: 1.5 },
  'gun-bangStick': { p: 'Bang stick powerhead detonating underwater: one massive concussive muffled boom, deep shockwave through water, debris and dense bubbles. Single detonation, no music.', sec: 2.0 },
  'knife-swing': { p: 'Dive knife slashing fast through water: short fluid swish, close, subtle. Single swing, no music.', sec: 0.6 },
  'knife-hit': { p: 'Blade striking waterlogged flesh underwater: dull wet thud with a soft tear, muffled, close. Single impact, no music.', sec: 0.7 },
  reload: { p: 'Underwater weapon reload: metallic magazine clack, spring compression, bolt sliding home, all muffled by water, close. No music.', sec: 1.4 },
  // ── the body ──
  'breath-calm': { p: 'Scuba regulator breathing, one calm cycle: slow hissing inhale through a regulator valve, then a relaxed exhale releasing a stream of rising bubbles. Realistic, close, first person. No music.', sec: 4.0 },
  'breath-panic': { p: 'Scuba regulator breathing, one panicked cycle: fast ragged inhale through a regulator, sharp trembling exhale with dense frantic bubbles. Distressed, close, first person. No music.', sec: 2.5 },
  heartbeat: { p: 'One deep human heartbeat, two dull thumps, lub-dub, felt more than heard, close and internal, dry, isolated. No music.', sec: 1.2 },
  'drown-pulse': { p: 'Drowning pressure pulse heard from inside a body underwater: one muffled heartbeat wrapped in water pressure squeeze and a weak air gurgle. Single pulse. No music.', sec: 1.2 },
  // ── the site's dead ──
  'moan-1': { p: 'Drowned corpse moaning underwater: low waterlogged male groan, wet gurgle under it, muffled and haunting, medium distance. Single moan, no music.', sec: 3.0 },
  'moan-2': { p: 'Drowned man wailing quietly underwater: mournful muffled vocal rise and fall, water-choked, eerie, medium distance. Single wail, no music.', sec: 3.5 },
  'moan-3': { p: 'Waterlogged rasping groan underwater: guttural dead voice with bubbling breath, slow, menacing, close. Single groan, no music.', sec: 3.0 },
  grab: { p: 'Heavy waterlogged hands seizing a diver: dull body impact, rubber and canvas scraping, burst of air ripped from a regulator, struggle, close, underwater. No music.', sec: 1.5 },
  'angler-hum': { p: 'Faint wrong electric lamp hum underwater: a quiet detuned two-note drone that never resolves, slightly warbling, hypnotic and uneasy, seamless loop. No melody, no rhythm.', sec: 8, loop: true },
  'guardian-presence': { p: 'Immense slow presence underwater: sub-bass pressure breathing of a giant brass diving suit, slow metallic groans and distant hull creaks, ominous, seamless loop. No music.', sec: 10, loop: true },
  // ── the cave ──
  'silt-whump': { p: 'Underwater silt explosion: one deep muffled whump, dense sediment billowing outward, fine particles hissing as they settle, then a faint high tinnitus ring fading. No music.', sec: 4.0 },
  'door-grind': { p: 'Heavy underwater rockfall being winched open: rock grinding on rock, a rusted steel winch creaking, silt rushing out, deep rumble settling. No music.', sec: 3.0 },
  'power-on': { p: 'A 1960s experimental reactor breaker slamming on underwater: heavy electrical thunk, generators winding up, a rising electrical hum settling into a deep steady thrum. No music.', sec: 5.0 },
  geiger: { p: 'A single dry geiger counter click, tiny, sharp, vintage instrument. One click only. No music.', sec: 0.5 },
  // ── economy & pickups ──
  'buy-accept': { p: 'A brass mechanical register lever clacking to accept payment: small, crisp, satisfying vintage mechanism. Single clack. No music.', sec: 0.7 },
  'buy-deny': { p: 'A small mechanical lever refusing: dull short double-clunk of a jammed vintage mechanism. No music.', sec: 0.7 },
  'drop-chime': { p: 'A small bright sonar pickup chime: two clean rising underwater pings, satisfying, short. Minimal, not a song.', sec: 1.2 },
  'tape-click': { p: 'A waterproof reel-to-reel tape recorder: one heavy vintage button clunk then a brief reel squeak. Close, mechanical. No music.', sec: 1.0 },
  'toy-wind': { p: 'A small tin wind-up toy being cranked: fine ratchet clicks, then the spring releasing into a brief mechanical whir. Close, tiny, charming and slightly eerie. No music.', sec: 1.8 },
  'toy-shimmer': { p: 'A faint music box mechanism turning over sparsely in the dark: three or four tiny detuned notes with long gaps, distant, underwater, eerie and gentle, seamless loop.', sec: 8, loop: true },
  'radio-squelch': { p: 'A brief vintage radio squelch: short static crackle burst with a soft carrier pop, small, close. No music.', sec: 0.8 },
  // ── depth ambience beds (user 2026-07-20 ×2: pressure rises with the
  // bands, and the lower two must be SCARIER — you should hear how strong
  // the current is and how high the pressure is) ──
  'ambient-shallow': { p: 'Calm underwater cave ambience, shallow sunlit water: soft water movement, gentle distant bubbles, faint muffled surface shimmer, peaceful but enclosed, seamless loop. No music, no melody.', sec: 12, loop: true },
  'ambient-mid': { p: 'Menacing deep underwater cave ambience: a strong current dragging and whooshing past rock, water pressure creaking and popping against stone, low turbulent rumble swelling and receding, distant groans of a settling flooded structure, heavy and unsettling, seamless loop. No music.', sec: 14, loop: true },
  'ambient-deep': { p: 'Terrifying crushing abyssal ambience: a violent current roaring and shearing through a narrow rock channel, immense water pressure grinding and straining, deep tectonic groans and metallic strain like a hull about to fail, sub-bass throbbing like a slow pulse, hostile oppressive dread, seamless loop. No music.', sec: 14, loop: true },
  // ── audio-emitter node palette (behind-the-walls life; user 2026-07-20) ──
  'amb-machinery': { p: 'Old industrial machinery running behind a thick rock wall: muffled rhythmic mechanical thumping, distant motors and pumps cycling, pipes knocking, heard through stone underwater, seamless loop. No music.', sec: 10, loop: true },
  'amb-airflow': { p: 'Heavy air flowing through unseen cave passages: deep powerful rushing airflow, resonant like wind through a huge duct, rising and falling slowly, distant, seamless loop. No music.', sec: 10, loop: true },
  'amb-groan': { p: 'An abandoned flooded structure settling: slow metal groans, deep sporadic creaks of stressed steel and rock, long silences between, ominous, heard through water, seamless loop. No music.', sec: 12, loop: true },
  'amb-drips': { p: 'Water dripping in a vast dark cavern: sparse echoing drips into a pool, hollow cave reverb, lonely and quiet, seamless loop. No music.', sec: 10, loop: true },
  // ── stingers & motifs (original, dark — DESIGN §14) ──
  'stinger-round': { p: 'A short dark orchestral horror stinger: one somber low French horn swell blooming into a dissonant minor chord, muffled as if heard through deep water, cinematic, 4 seconds, then silence.', sec: 5.0 },
  'stinger-stirs': { p: 'A short rising horror tension swell: low strings and a distant horn climbing, unresolved, cut off uneasily, heard through deep water, cinematic, 4 seconds.', sec: 5.0 },
  'perk-jingle': { p: 'A short dark music-box jingle: four descending minor-key notes on an aged mechanical music box, slightly detuned, eerie carnival feeling, 3 seconds, then silence.', sec: 4.0 },
  'box-tease': { p: 'A hand-cranked music box playing a brief sparse plinking melody, slightly detuned and wrong, playful and sinister, 3 seconds.', sec: 4.0 },
  'pap-motif': { p: 'A low ghostly choir groan swelling underwater: deep male voices blooming into a dark sacred chord with a metallic shimmer over it, 4 seconds, cinematic horror.', sec: 5.0 },
  'death-sting': { p: 'A grim descending doom sting: low detuned brass falling slowly into silence, final, heard through deep water, 4 seconds.', sec: 5.0 },
  'win-sting': { p: 'A bittersweet somber resolution sting: warm low brass and faint choir rising once into daylight and settling, relief with unease underneath, 5 seconds.', sec: 6.0 },
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

const outDir = path.join(ROOT, 'public/audio/sfx');
fs.mkdirSync(outDir, { recursive: true });
let made = 0;
let failed = 0;
for (const [name, def] of Object.entries(SFX)) {
  if (ONLY && !ONLY.includes(name)) continue;
  const file = path.join(outDir, `${name}.mp3`);
  if (!FORCE && fs.existsSync(file)) {
    console.log('skip (exists)', name);
    continue;
  }
  try {
    const body = { text: def.p, duration_seconds: def.sec, prompt_influence: 0.55 };
    if (def.loop) body.loop = true;
    let buf;
    try {
      buf = await api('/v1/sound-generation?output_format=mp3_44100_128', body);
    } catch (e) {
      if (def.loop && /loop/.test(String(e))) {
        delete body.loop; // older API: generate straight, the runtime loops it
        buf = await api('/v1/sound-generation?output_format=mp3_44100_128', body);
      } else throw e;
    }
    fs.writeFileSync(file, buf);
    made++;
    console.log('wrote', name, `(${(buf.length / 1024) | 0} KB)`);
  } catch (e) {
    failed++;
    console.error('FAILED', name, '—', String(e).slice(0, 200));
  }
}

// merge the sfx section into the manifest (generate-vo owns vo/tapes)
const manifestFile = path.join(ROOT, 'public/audio/manifest.json');
let manifest = { vo: {}, tapes: {} };
try {
  manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
} catch {
  // first run — vo/tapes fill in when generate-vo runs
}
manifest.sfx = {};
for (const [name, def] of Object.entries(SFX)) {
  if (fs.existsSync(path.join(outDir, `${name}.mp3`))) {
    manifest.sfx[name] = { url: `/audio/sfx/${name}.mp3`, ...(def.loop ? { loop: true } : {}) };
  }
}
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
console.log(`done: ${made} generated, ${failed} failed, manifest sfx entries: ${Object.keys(manifest.sfx).length}`);
if (failed > 0) process.exitCode = 1;
