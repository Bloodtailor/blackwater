import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

// Dev-only screenshot sink: the game POSTs canvas PNGs to /__shot?name=x and
// they land in docs/screens/. Lets the harness verify visuals even when the
// Browser pane is hidden (rAF throttled to zero), and archives DoD screenshots.
function shotPlugin(): Plugin {
  return {
    name: 'bw-shot',
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
  };
}

export default defineConfig({
  plugins: [shotPlugin()],
  server: {
    watch: {
      // The level editor SAVES layout.json while you're standing in it — a
      // watcher reload would wipe editor state on every save. Game/editor
      // tabs pick the file up on their next manual reload instead.
      ignored: ['**/src/cave/layout.json'],
    },
  },
});
