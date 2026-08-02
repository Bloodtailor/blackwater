# ADDENDUM to docs/web-deploy.md — corrections + repo setup

Give this to Claude Code alongside (or after) the main handoff. It corrects two
assumptions in that document and adds the repo step.

---

## Correction 1: this is a Worker with static assets, not Cloudflare Pages

The blog (`Bloodtailor/blog`) is already deployed on Cloudflare as a **Worker with
static assets**, not a Pages project. BLACKWATER should mirror that exact setup so
both sites work the same way. Concretely, replace step 6 of `docs/web-deploy.md`
with this.

Add `wrangler.jsonc` at the repo root:

```jsonc
{
  "name": "blackwater",
  "compatibility_date": "2026-08-01",
  "assets": {
    "directory": "./dist"
  }
}
```

The dashboard build settings will be (I'll configure these, don't worry about them):

| setting | value |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Root directory | `/` |
| Production branch | `main` |

**The `_headers` file placement is different from Pages.** Put it in `public/`, not
in `dist/` — Vite copies `public/` into `dist/` at build time, and `dist/` is
gitignored so anything written there directly is lost. Contents:

```
/assets/*
  Cache-Control: public, max-age=31536000, immutable

/images/manifest.json
  Cache-Control: public, max-age=60
/images/concept/manifest.json
  Cache-Control: public, max-age=60
/music/easteregg/tracks.json
  Cache-Control: public, max-age=60
```

Note that `_headers` on Workers static assets only applies to static asset
responses. That's all we have, so it's fine — just don't expect it to cover
anything else later.

## Correction 2: base path stays `/`

We settled on `play.aaronorelup.com` — a subdomain, served at its root. So
`base` stays `'/'`. Still make it env-driven per step 5 so a subpath deploy is
possible later, but don't set it to anything else now.

## New step: create the GitHub repo

`git remote -v` in this repo returns nothing — BLACKWATER is local-only. Cloudflare
builds from a connected Git repo, so it needs to be on GitHub before anything can
deploy.

- Create **`Bloodtailor/blackwater`** (`gh repo create` — the account is already
  authenticated, that's where `Bloodtailor/blog` lives).
- Public, since the whole point is portfolio visibility.
- Confirm `.gitignore` still covers `node_modules/`, `dist/`, and `.env` **before**
  the first push. `.env` holds API keys per the README and must never land on
  GitHub. Double-check it isn't already tracked from an earlier commit:
  `git log --all --full-history -- .env` should be empty.
- Push `main`.

This is one repo, not a copy of anything — it's the only home this project has had.

## Verify before handing back

In addition to the checks in `docs/web-deploy.md` step 7:

- `npx wrangler deploy --dry-run` succeeds and reports the asset count.
- Report the final `du -sh dist` and `find dist -type f | wc -l`. The ceiling is
  20,000 files and 25 MiB per file on the free plan — we're at 180 files with a
  3.7 MB largest file today, so this is a sanity check, not a risk.
- Confirm `_headers` landed in `dist/_headers` after the build.

Then tell Aaron it's pushed, and he'll hand off the deploy.
