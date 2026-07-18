# BLACKWATER — Build Plan

> **STATUS — NEXT UP: M0 (Scaffold).** Update this line every session.

## Session protocol (follow this every prompt)

1. Read DESIGN.md and this file. Trust the docs over memory of past sessions; trust `src/cave/data.ts` over both for layout specifics.
2. Smoke check: `npm run dev` via the preview pane, load the game, glance at console. If the repo is broken, fixing it *is* the session until green. (Skip pre-M0.)
3. Do the **next unchecked milestone**. One milestone per prompt. If a milestone turns out too big, split it *in this file* mid-session and finish the first half properly — never rush the back half.
4. Every feature lands with its `?debug=1` trigger in the same milestone.
5. **Verify the Definition of Done in the browser** — teleport to it, trigger it, screenshot it. Check the FPS counter. Only then check the box.
6. Update the STATUS line, append a Worklog entry (3–6 lines: what shipped, what I learned, what I changed in the docs and why). Update DESIGN.md if a design decision changed — intent changes only, not number nudges.
7. Commit (small WIP commits mid-milestone are encouraged; final commit at milestone end). Never commit `.env`. Repo must run cleanly before the session ends.
8. Rules of the codebase: DESIGN.md §16. Non-negotiables: map-as-data, all numbers in `tuning.ts`, no new deps without a note here.

## Milestones

### M0 — Scaffold & harness
- [ ] Vite + TypeScript (strict) + Three.js; `npm run dev`; `.gitignore` covers `node_modules`, `dist`, `.env`
- [ ] `.claude/launch.json` so the preview pane can start the dev server
- [ ] Render a placeholder chamber (displaced-noise sphere), water fog, FPS counter
- [ ] Freefly noclip camera; `?debug=1` panel skeleton + hotkey framework; screenshot-friendly (HUD-less) mode
- [ ] `src/tuning.ts` created; Vitest wired with one trivial test
- **DoD:** preview shows a foggy rock chamber I can fly through at 60 fps; debug panel opens; committed.

### M1 — Cave data & map viewer
- [ ] Schema from DESIGN §16; author the full layout in `src/cave/data.ts` (all 5 zones, every tag: burrows, pockets, mounds, tilt edges, squeezes, doors, buys, perks, box spots, power, PaP, Heart, tapes, caches, tie-offs)
- [ ] `?view=map`: labeled 3D wireframe + ortho top/side projections, color by zone/tag
- [ ] Automated layout assertions (Vitest + shown in viewer): two-route rule (on the fully-opened graph), door progression (every zone reachable via purchasable doors; alternates per DESIGN §10.3), air rule (BFS at swim speed), ≥1 vertical passage ≥25 m, ≥4 squeezes, ≥8 dead ends
- **DoD:** all assertions pass; map-viewer screenshots (top + side) look like DESIGN §5 and get committed to `docs/layout/` as the permanent visual reference.

### M2 — Geometry & collision
- [ ] Generate the cave mesh from the graph via SDF (union of tunnel capsules + chamber spheres + 3D noise warp) extracted with marching cubes — watertight, organic, handles overhangs and layered crossings; triplanar rock shader; zone palettes
- [ ] Closed-door blockers (debris/grate/hatch meshes + collision) generated from edge data; debug toggle to open any door
- [ ] Capsule collision vs. cave walls; squeeze traversal (forced slow, no turn-around, camera pull-in)
- [ ] Water surface plane + above/below transition at the Sinkhole; debug: teleport-to-node
- **DoD:** I fly the entire cave with collision on (doors debug-opened): no holes, no leaks, every passage traversable including all squeezes and the Throat; closed doors physically block; 60 fps throughout; screenshots of each zone committed.

### M3 — Player: swim, air, light
- [ ] 6DOF swim per DESIGN §6.1 (momentum, sprint, vertical) + surface walk on the platform
- [ ] Air system §6.2 (drain modifiers, pockets/surface refill, low-air state, drowning damage); health + regen + death/restart flow
- [ ] Flashlight §6.4 (cone, battery drain, dim/flicker curve, toggle); bubbles: exhale stream that rises world-up
- [ ] HUD v1: O2, battery pips, depth gauge + trend, ammo placeholder, points placeholder
- [ ] Debug: infinite air/battery, god, set-air slider
- **DoD:** with debug teleports I can: nearly drown and recover at a pocket, watch the light dim to flicker, read depth while inverted; feels controllable at 60 fps.

### M4 — Atmosphere & impairment
- [ ] Fog/darkness grades per zone; light falloff with depth; sinkhole god-ray billboards; ambient particulate
- [ ] Ambient silt: silty-floor stir on fast/low swimming, local vis reduction, settle timer (§7.1)
- [ ] Chalk mounds: distinct mesh + shimmer; detonation on shot/touch → chamber silt-out (vis 4 m, beam 60°→25°), 75 s fade, re-arm on full clear (§7.2)
- [ ] Tilt zones per edge tags (drift rates, per-zone caps, X to re-level, natural decay); accessibility cap slider (functional even pre-menu, via settings stub)
- [ ] Guide line: anchor, pay-out, tie-offs, re-reel, follow mode in silt; chemlights: place/toss, persistence, cap
- [ ] Debug: trigger/clear silt-out, set tilt, give reel/chemlights
- **DoD:** screenshot set: clear vs ambient-stir vs full silt-out in the same chamber; video-frame sequence of a silt-out fading and mound re-arming; I can navigate White Chapel → Maze hub in a forced silt-out using only a pre-laid line + chemlights. Tilt to 180° in the Throat and re-orient by bubbles alone.

### M5 — Zombies & rounds
- [ ] Drowned: procedural drift-swimmer look, graph A* + local steering, attack/grab (damage, −8 air, tilt kick), corpse drift
- [ ] Burrow spawning (nearest-to-player, ≥12 m, sight-avoidance, per-burrow activation rounds — surface decay §5.1)
- [ ] Round system: counts/HP/speed curves from `tuning.ts`, 40 s timed intermission, the Cave Stirs countdown (DESIGN §9: scaled threshold, 45 s, survivors carry over), round stingers + tally UI
- [ ] Hit reactions, deaths, points for hit/kill/headshot/melee; Dive Knife + starter Wrist Dart functional
- [ ] Debug: spawn N at node, start round N, kill-all
- **DoD:** playing manually with assists as needed (slow-mo/god for observation), rounds 1–5 at the surface are survivable and round ~6's spawns push me off it; the Cave Stirs countdown visibly fires on a stalled near-empty round and the next round starts on top with survivors carried; pathing chases me through squeezes and the Throat without stuck zombies (spot-check 10 chases via debug); zombies never path through closed doors.

### M6 — Economy
- [ ] Doors: buy-open flow (hold-E prompt, cost, grind-open + silt puff, permanently open, pathing unblocks for zombies too)
- [ ] Wall buys (all §10.1 incl. batteries/reels/chemlights, ammo at half cost); buy prompts + costs UI
- [ ] Mystery box at A/B/C with tease-and-move; full weapon pool implemented (wall + box guns, distinct feel per DESIGN §10.2 — this is the biggest single task in the milestone; split if needed)
- [ ] Power switch → perks vend, string lights on arteries, PaP grate opens
- [ ] Perk stations, 4-cap, all 9 perk effects wired (Second Wind full flow: blackout → wake at last pocket → perk consumed)
- [ ] Pack-a-Punch: ×2.5, mag+, rename, universal light-emitting projectiles; PaP ammo
- [ ] Drops: all 6 from §10.6 with pity timer
- [ ] Debug: give points/weapon/perk, force drop, toggle power
- **DoD:** with debug points I purchase literally everything in one session (every door, gun, perk, consumable); each weapon fires with distinct feel and PaP versions glow-trace; Second Wind demonstrably saves and consumes itself; reaching power by round ~6 is comfortably affordable per the economy numbers (verified by simulation math, not manual skill).

### M7 — Specials, Abyss, win/lose
- [ ] Angler (lure light, lunge, battery drop, spawn schedule); Silt Shade (silt-out-bound lifecycle)
- [ ] Guardians: patrol, sensory aggro (light/sprint/proximity tiers), heavy hit, respawn-next-round; Abyss biolum field for lights-off play
- [ ] The Heart: apse setup, grab → Ascent event (global spawning, speed-cap zombies, vis down one grade, glow-in-hands) → surface win; Heart drop/re-grab on Second Wind death
- [ ] Win + death screens with full run stats; restart loop clean
- **DoD:** scripted verification of each special via debug (Angler ambush from a fake-light setup; Shade dies with the silt; sneak past Guardians lights-off, get caught lights-on); then one full assisted run (debug points allowed, no god): grab the Heart, ascend, win screen shows correct stats.

### M8 — Audio & flavor
- [ ] WebAudio graph: global underwater low-pass/convolver, surface-break transition, positional attenuation/occlusion
- [ ] Generate via ElevenLabs (key in `.env`; VO + SFX endpoints), commit as static assets: breathing set, heartbeat, regulator/bubbles, moans, Angler hum, Guardian presence, silt whump, stingers, perk jingles, box/PaP motifs, 6 radio logs (write scripts first; Site BLACKWATER, 1968). WebAudio-synth fallback for anything weak.
- [ ] Wire everything incl. breathing-to-air-level, low-air heartbeat; volume sliders + subtitles for logs
- [ ] Title/pause/settings/How-to-Dive menus finalized (settings from DESIGN §12)
- **DoD:** headphone pass with eyes closed: I can tell air state, zombie direction, silt-out, and surface break by sound alone; all 6 logs subtitled and skippable; menus navigable start-to-restart.

### M9 — Balance via pilot mode & simulation (the biggest quality lever — do not rush)
Honest constraint: I cannot reliably twitch-pilot a 40–70 min real-time run through screenshots. Full runs are tested by machinery; my manual play is only for judging feel.
- [ ] **Balance simulation (headless):** pure-math model over the real `tuning.ts` + graph distances — points income per round, chore time/air budgets at swim speeds, weapon TTK vs HP curve. Sweep strategies; verify the race window mathematically first.
- [ ] **Pilot mode (debug):** scripted strategy runner inside the real game — graph pathfinding (same as zombies), auto-aim, strategy scripts (rush-power / greed-box / ghost-build / tank-build), runs at 1–4× timescale, logs every run (per-round economy, deaths + causes, air incidents)
- [ ] Iterate: pilot-run batches → read logs → adjust `tuning.ts` → rerun, tuning to DESIGN §17 priorities (air pressure felt, race window rounds 15–20, deaths attributable)
- [ ] **Manual feel passes** (slow-mo/god allowed): fear readability, silt-out panic arc, tilt discomfort-vs-nausea, Angler deception, Abyss lights-off tension; worklog each pass
- [ ] Fix every bug and unfun interaction found
- **DoD:** ≥10 logged pilot runs; ≥2 distinct strategies win while over-greedy/too-slow scripts lose for attributable reasons; simulation and pilot logs agree on the race window; feel passes logged with resulting changes; no known crash/softlock/stuck-zombie/lost-forever state.

### M10 — Performance & ship
- [ ] Perf pass: instancing/pooling audit, draw-call check, 60 fps everywhere incl. silt-out + 9 zombies + Ascent
- [ ] One full pilot run against the built `dist/` preview completes cleanly
- [ ] Final sweep: console clean, restart-loop leak check, README gets How-to-Play + screenshots, `npm run build` works, final commit
- **DoD:** fresh `npm run build` + preview of `dist/` plays a full run flawlessly; docs current; STATUS reads SHIPPED.

## Post-ship candidates (only after M10; pick by fun-per-effort)
Endless mode after victory · zombies that cut guide lines · procedural layout variation · Gemini-generated tape-player portrait stills · second silt-trap type · gamepad support.

## Cut list (explicitly out of scope v1)
Multiplayer/co-op · saves mid-run · difficulty modes (the tilt slider is accessibility, not difficulty) · runtime API calls · non-procedural art assets.

## Risks & mitigations
- **Underwater zombie pathing jank** → path on the authored graph, steer only locally inside chambers; debug spawn + chase spot-checks every zombie change.
- **Silt/particle perf** → instanced particles only, per-chamber budgets, measure in M4 not M10.
- **Scope creep in weapons (M6)** → distinct-feel bar, not realism bar; split the milestone before quality drops.
- **ElevenLabs output disappoints** → WebAudio synth fallback listed per-sound in M8; VO is flavor, not load-bearing.
- **Motion sickness from tilt** → honest tells + accessibility cap, default respected in all debug videos.
- **Context loss between sessions** → this file + DESIGN.md + worklog are the only memory; write them like the next session knows nothing.
- **I can't twitch-pilot long real-time runs via screenshots** → pilot mode + headless simulation carry all win/lose and balance testing; manual play is feel-judgment only, with slow-mo/god assists.

## Worklog (append-only; newest last)
- **2026-07-18 — Planning session.** DESIGN.md and PLAN.md written from the user's brief + my redesign (race structure, guide line, honest-tells doctrine). Layout-as-data + map viewer + debug-harness-first chosen specifically to avoid the prior "Venice Beach" failure (assets improvised against an undocumented layout). Keys present in `.env` (ELEVENLABS_API_KEY, GEMINI_API_KEY, DEEPSEEK_API_KEY — names only, never commit). Repo initialized. Nothing coded yet by explicit user instruction.
- **2026-07-18 — Design revision (user feedback).** Door buys restored (DESIGN §10.3: progression + shortcut doors, buy-open/never-close, ~5500 mandatory) — consistent with "passages never close" since doors only ever add passage. Frenzy rule replaced by the user's mechanic, the Cave Stirs countdown (§9): near-empty rounds auto-advance after 45 s, survivors carry over; pillar 2 reworded — I had oversold breath as the anti-crawler mechanic (it taxes chores; only a rule stops round-freezing). M9 rebuilt around headless balance simulation + in-game scripted pilot mode after honestly assessing that I can't twitch-play long real-time runs; manual play is for feel only. Geometry method pinned: SDF + marching cubes for organic/layered passages.
