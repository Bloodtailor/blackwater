# BLACKWATER

Black Ops 1 zombies × cave diving. Solo, single-run, browser game (TypeScript + Three.js).

- **The pitch:** [PITCH.md](PITCH.md)
- **What the game is:** [DESIGN.md](DESIGN.md)
- **The world, character, and every asset's identity:** [LORE.md](LORE.md)
- **Build status and next step:** [PLAN.md](PLAN.md) (see the STATUS line and Session Protocol)

Design and lore are **locked** (2026-07-18): build sessions implement and tune; they do not redesign.

## Playing it

- **Double-click `play.bat`** — starts the dev server and opens the game in your browser.
- Or manually: `npm run dev`, then open <http://localhost:5173/> (add `?debug=1` for the debug panel).
- Controls (current build): click the canvas to mouse-look · WASD move · Space/C up/down · Shift fast · F1 debug panel · H hide UI.

Built autonomously by Claude Code. `.env` holds API keys and is never committed.
