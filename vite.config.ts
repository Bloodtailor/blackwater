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
});
