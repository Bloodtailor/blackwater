// PNG → WebP for the shipped art (web-deploy §4). The gallery prints and the
// concept paintings were ~60 MB of PNG; at quality 90, full resolution,
// method 6 they land around 9 MB with no visible loss. Full res on purpose —
// half-res gets you 96% off but the drop is visible on display art the player
// stands in front of and reads.
//
//   node scripts/webp-assets.mjs          convert + rewrite both manifests
//   node scripts/webp-assets.mjs --keep   leave the PNGs in public/
//
// The originals are NOT deleted — everything under public/ is copied into
// dist/, so the PNGs move to art-src/ instead. They stay in the tree (a
// re-encode at another quality needs them; regenerating costs API calls) and
// out of the shipped payload. Idempotent: a .webp newer than its .png is
// left alone.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const keep = process.argv.includes('--keep');
// source dir → where its PNG originals are parked once converted
const DIRS = [
  ['public/images', 'art-src/images'],
  ['public/images/concept', 'art-src/concept'],
];

const kb = (n) => `${(n / 1024).toFixed(0)} kB`;

async function convertDir(rel, archiveRel) {
  const dir = path.join(root, rel);
  if (!fs.existsSync(dir)) return { before: 0, after: 0, files: 0 };
  const archive = path.join(root, archiveRel);
  let before = 0;
  let after = 0;
  let files = 0;
  for (const name of fs.readdirSync(dir)) {
    if (!name.toLowerCase().endsWith('.png')) continue;
    const png = path.join(dir, name);
    const webp = png.replace(/\.png$/i, '.webp');
    const src = fs.statSync(png);
    const fresh = fs.existsSync(webp) && fs.statSync(webp).mtimeMs >= src.mtimeMs;
    if (!fresh) {
      await sharp(png).webp({ quality: 90, effort: 6 }).toFile(webp);
      console.log(`  ${name} ${kb(src.size)} → ${kb(fs.statSync(webp).size)} (${Math.round((1 - fs.statSync(webp).size / src.size) * 100)}% smaller)`);
    }
    before += src.size;
    after += fs.statSync(webp).size;
    files++;
    if (!keep) {
      fs.mkdirSync(archive, { recursive: true });
      fs.renameSync(png, path.join(archive, name)); // out of the payload, not gone
    }
  }
  return { before, after, files };
}

function rewriteImagesManifest() {
  const file = path.join(root, 'public/images/manifest.json');
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  let n = 0;
  for (const [k, v] of Object.entries(json)) {
    if (typeof v === 'string' && v.endsWith('.png')) {
      json[k] = v.replace(/\.png$/i, '.webp');
      n++;
    }
  }
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
  console.log(`  public/images/manifest.json: ${n} url(s) → .webp`);
}

function rewriteConceptManifest() {
  const file = path.join(root, 'public/images/concept/manifest.json');
  if (!fs.existsSync(file)) return;
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  let n = 0;
  for (const entry of Object.values(json)) {
    if (entry && typeof entry.url === 'string' && entry.url.endsWith('.png')) {
      entry.url = entry.url.replace(/\.png$/i, '.webp');
      n++;
    }
  }
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
  console.log(`  public/images/concept/manifest.json: ${n} url(s) → .webp`);
}

let before = 0;
let after = 0;
let files = 0;
for (const [dir, archive] of DIRS) {
  console.log(`${dir}:`);
  const r = await convertDir(dir, archive);
  before += r.before;
  after += r.after;
  files += r.files;
}
rewriteImagesManifest();
rewriteConceptManifest();
console.log(
  `\n${files} file(s): ${(before / 1024 / 1024).toFixed(1)} MB → ${(after / 1024 / 1024).toFixed(1)} MB` +
    ` (${Math.round((1 - after / before) * 100)}% smaller)${keep ? ' — PNGs kept' : ''}`,
);
