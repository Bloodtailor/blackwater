# BLACKWATER — pre-deploy prep (public portfolio build)

Paste this to the Claude Code session running in the BLACKWATER repo.

---

We're publishing BLACKWATER as a public, static, browser-playable build on
Cloudflare Pages. The site is a **portfolio** — the goal is to show the work, not
to ship a commercial game. That reframing matters for step 2: the debug tools and
the level editor are features here, not things to hide.

Design and lore stay locked — this is packaging work only, no gameplay changes.

Do the following, in order. Stop and report if any step contradicts what you find.

## 1. Make the toolkit a first-class public feature

The debug panel, the tuning panel, and especially the level editor stay in the
public build and get promoted, not gated. Add a **"Developer Tools"** button to the
title screen alongside the play option — a visitor should be able to find the
editor without knowing `?debug=1` exists.

Give it a short intro screen: what these tools are, that they were built alongside
the game, and the keys that matter (F1 debug panel, H hide UI, editor controls).
Assume the reader is a developer who has never seen this project.

**Do not** strip these behind `import.meta.env.DEV`. Everything ships.

## 2. Fix persistence — the tools currently can't save on a static host

This is the real work in this handoff, so read it carefully before writing code.

Three features write to disk through dev-server middleware that **will not exist**
on Cloudflare Pages:

| feature | current | file written |
|---|---|---|
| editor save (`src/editor/editor.ts:396`) | `POST /__layout` | `src/cave/layout.json` |
| tuning save (`src/debug/tuningPanel.ts:194`) | `POST /__tuning` | `src/tuning.overrides.json` |
| screenshots (`editor.ts:894`, `main.ts:1902`, `viewer/map.ts:168`) | `POST /__shot` | `docs/screens/` |

Deployed as-is, a visitor builds a map, hits Save, and silently loses it. That's a
worse portfolio impression than not shipping the editor at all.

Rework each to a browser-native equivalent, keeping the dev-server path when
`import.meta.env.DEV` is true so your own workflow is unchanged:

- **Editor save** → write to `localStorage` so a work-in-progress survives reload,
  plus an explicit **"Download layout.json"** button producing a real file via a
  Blob + object URL. Add the matching **"Load layout.json"** file picker so a
  downloaded map can come back in. Round-trip must work.
- **Tuning save** → `localStorage` overrides applied at startup on top of the
  committed defaults, plus **"Download overrides"** / **"Reset to defaults"**.
- **Screenshots** → trigger a normal browser download of the canvas PNG instead of
  POSTing it.
- **Probe capture** (`main.ts:823`) → already `.catch()`-guarded; make it a no-op in
  prod rather than a failing request.

Confirm `public/music/easteregg/tracks.json` is written by `buildStart` for dist
builds — the jukebox must not depend on the dev-only listing route.

Nothing in the deployed build may leave an unhandled rejection or a 404 for
`/__*` in the console. That console is part of the portfolio too.

## 3. Add a keyboard/pointer-lock gate

The game is pointer-lock + WASD (`src/main.ts:165`, `src/debug/freefly.ts:25`), so
it's desktop-only. Public traffic skews mobile. If the device lacks pointer lock or
is touch-primary, show a short in-theme "this dive needs a keyboard and mouse"
screen instead of an unplayable canvas.

Let mobile visitors still reach a read-only version of the tools intro and any
screenshots — they came from a portfolio link and should see *something*.

## 4. Cut the payload

`dist/` is ~86 MB today. Measured on three of the actual gallery PNGs:

| file | now | WebP q90, full-res |
|---|---|---|
| g1.png | 2.32 MB | 0.50 MB (78% smaller) |
| g12-sign.png | 2.11 MB | 0.42 MB (80% smaller) |
| g9-finKick.png | 2.15 MB | 0.41 MB (81% smaller) |

Convert all 24 files in `public/images/` plus `public/images/concept/` to WebP at
**quality 90, full resolution, method 6** — roughly 60 MB down to 9 MB with no
visible loss. Do not downscale; half-res reaches 96% but the drop is visible on
display art.

Both sets load through manifests (`src/game/media.ts:19`, `src/game/concept.ts:42`),
so update `public/images/manifest.json` and `public/images/concept/manifest.json`.
Catch any hardcoded `.png` outside the manifests.

Make the ~14 MB of `public/music/easteregg/` lazy — fetch a track on first play, not
at page load. Same for `public/audio/` assets not needed before the first dive.

Target: initial load under ~10 MB, full first dive under ~25 MB.

## 5. Configurable base path

Root deploy needs no `base`; a subpath needs `base: '/blackwater/'`. Drive it from
an env var in `vite.config.ts`, defaulting to `'/'`.

## 6. Deploy config + docs

- Pages build config: build command `npm run build`, output directory `dist`.
- A `_headers` file: long-lived immutable cache on `/assets/*` (hashed names),
  short/no-cache on the manifests and `tracks.json`.
- `README.md` gets a "Deploying" section next to "Playing it".
- `PLAN.md` notes the public build exists and what it includes.

## 7. Verify before calling it done

- `npm run build` clean, `tsc` clean, 167/167 tests passing.
- `npm run preview` and actually play it: dive, take damage, buy something, trigger
  a jingle, open the map. Then open the editor, build something, save, reload, and
  confirm it came back. Then download the layout and re-import it.
- Console clean — no `/__*` 404s, no unhandled rejections.
- Report final `du -sh dist` and `find dist -type f | wc -l`.

Commit as a single milestone in the existing PLAN.md style. Do not restructure the
repo or create branches — deployment config is handled separately.
