import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin, type ViteDevServer } from 'vite';

// tuning.overrides.json is a JSON MODULE the game imports, and it is rewritten
// at runtime by the panel's SAVE. Vite caches that module's transform, so a
// saved (or hand-edited) file stayed invisible until the dev server restarted:
// the user saved zombie HP, reloaded, and got the old number back — then the
// next save wrote the stale map over the file for real (user bug 2026-08-02).
// Dropping the module from the graph makes the NEXT page load read the file.
function invalidateTuningOverrides(server: ViteDevServer): void {
  for (const [id, mod] of server.moduleGraph.idToModuleMap) {
    if (id.includes('tuning.overrides.json')) server.moduleGraph.invalidateModule(mod);
  }
}

// Dev-only screenshot sink: the game POSTs canvas PNGs to /__shot?name=x and
// they land in docs/screens/. Lets the harness verify visuals even when the
// Browser pane is hidden (rAF throttled to zero), and archives DoD screenshots.
function listTracks(root: string): string[] {
  try {
    return fs
      .readdirSync(path.resolve(root, 'public/music/easteregg'))
      .filter((f) => /\.(mp3|ogg|wav|m4a)$/i.test(f));
  } catch {
    return [];
  }
}

function shotPlugin(): Plugin {
  return {
    name: 'bw-shot',
    // dist builds get a real tracks.json snapshot of the folder
    buildStart() {
      const dir = path.resolve(__dirname, 'public/music/easteregg');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'tracks.json'), JSON.stringify(listTracks(__dirname)) + '\n');
    },
    configureServer(server) {
      // Level-editor save: the editor POSTs the whole layout and it lands in
      // src/cave/layout.json — the file the game loads. Editing IS saving.
      server.middlewares.use('/__layout', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (c: Buffer) => (body += c.toString()));
        req.on('end', () => {
          try {
            const layout = JSON.parse(body) as { nodes: unknown[]; edges: unknown[] };
            if (!Array.isArray(layout.nodes) || !Array.isArray(layout.edges)) throw new Error('bad layout');
            const file = path.resolve(server.config.root, 'src/cave/layout.json');
            fs.writeFileSync(file, JSON.stringify(layout, null, 2) + '\n');
            res.end('ok');
          } catch {
            res.statusCode = 400;
            res.end('bad body');
          }
        });
      });
      // Ghost-wall probe sink: P-key probes append here so they survive
      // reloads and reach the next build session (docs/probes.jsonl).
      server.middlewares.use('/__probe', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (c: Buffer) => (body += c.toString()));
        req.on('end', () => {
          try {
            JSON.parse(body); // validate
            const dir = path.resolve(server.config.root, 'docs');
            fs.mkdirSync(dir, { recursive: true });
            fs.appendFileSync(path.join(dir, 'probes.jsonl'), body.replace(/\n/g, ' ') + '\n');
            res.end('ok');
          } catch {
            res.statusCode = 400;
            res.end('bad body');
          }
        });
      });
      // Tuning SAVE (user 2026-07-20): the debug/editor panels POST the full
      // override map here; it lands in src/tuning.overrides.json (committed,
      // loaded at startup as the new stock values). watch-ignored like
      // layout.json so saving doesn't reload the editor out from under you.
      server.middlewares.use('/__tuning', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (c: Buffer) => (body += c.toString()));
        req.on('end', () => {
          try {
            const map = JSON.parse(body) as Record<string, number>;
            if (typeof map !== 'object' || map === null || Array.isArray(map)) throw new Error('bad map');
            for (const v of Object.values(map)) if (typeof v !== 'number') throw new Error('non-numeric');
            fs.writeFileSync(path.resolve(server.config.root, 'src/tuning.overrides.json'), JSON.stringify(map, null, 2) + '\n');
            invalidateTuningOverrides(server); // reloads must see what we wrote
            res.end('ok');
          } catch {
            res.statusCode = 400;
            res.end('bad body');
          }
        });
      });
      // Jukebox track listing (M8b): the folder IS the playlist — drop MP3s
      // into public/music/easteregg/, zero code changes (LORE §6). Dev serves
      // a live listing; `buildStart` writes the static file for dist builds.
      server.middlewares.use('/music/easteregg/tracks.json', (_req, res) => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(listTracks(server.config.root)));
      });
      server.middlewares.use('/__shot', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        const url = new URL(req.url ?? '/', 'http://localhost');
        const name = (url.searchParams.get('name') ?? 'shot').replace(/[^a-z0-9_-]/gi, '');
        let body = '';
        req.on('data', (c: Buffer) => (body += c.toString()));
        req.on('end', () => {
          const m = body.match(/^data:image\/png;base64,(.+)$/);
          if (!m) {
            res.statusCode = 400;
            res.end('bad body');
            return;
          }
          const dir = path.resolve(server.config.root, 'docs/screens');
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, `${name}.png`), Buffer.from(m[1], 'base64'));
          res.end('ok');
        });
      });
    },
    // Hand-edit the overrides file and the watcher fires here: drop the stale
    // module, but return [] so nothing reloads — tuning must never yank the
    // page out from under a dive or an editor session.
    handleHotUpdate(ctx) {
      if (ctx.file.replace(/\\/g, '/').endsWith('src/tuning.overrides.json')) {
        invalidateTuningOverrides(ctx.server);
        return [];
      }
      return undefined;
    },
  };
}

// Deploy base (web-deploy §5): root needs nothing, a subpath needs
// `BW_BASE=/blackwater/ npm run build`. Every runtime asset url goes through
// assetUrl() in src/util/persist.ts, so both cases resolve the same way.
const base = process.env.BW_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [shotPlugin()],
  server: {
    watch: {
      // The level editor SAVES layout.json while you're standing in it — a
      // watcher reload would wipe editor state on every save. Game/editor
      // tabs pick the file up on their next manual reload instead.
      // tuning.overrides.json is NOT ignored: handleHotUpdate above swallows
      // its reload the same way, but the watcher event is what lets us drop
      // the cached JSON module so the next load reads the real file.
      ignored: ['**/src/cave/layout.json'],
    },
  },
});
