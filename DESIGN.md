# BLACKWATER — Design Document

Working title: **BLACKWATER** (Black Ops 1 zombies × cave diving). Solo-only, single-run, browser game.

> **DESIGN LOCKED 2026-07-18.** Systems, lore, and mechanics are final per the user ("set in stone"). Build sessions implement, tune numbers (`tuning.ts`), and fix — they do not redesign. Deviations only when implementation physically forces one; log any such deviation loudly in PLAN.md's worklog.

> **How to use this document (note to future me):** This file is the source of truth for *what the game is*. PLAN.md is the source of truth for *what to do next*. LORE.md is the source of truth for *why the world looks and sounds the way it does* — setting, player character, VO, every asset's in-world identity and appearance, tape scripts, the easter egg song, and the Gemini image manifest. Build nothing player-visible without checking LORE.md. When implementation reality diverges from this doc, update the doc in the same session — never let the code become the only record of a decision. Once `src/cave/data.ts` exists, it is the source of truth for the *layout itself*; this doc only states layout *requirements* the data must satisfy. All gameplay numbers below are v1 guesses — they live in `src/tuning.ts` once coded, and Milestone 9 (balance) owns changing them. When tuning changes a number, update it here only if the *design intent* changed, not for every nudge.

---

## 1. Pitch

You are a diver at the lip of a flooded sinkhole that leads down into a drowned Cold-War research site. Every round, the drowned dead come for you. Points buy weapons, perks, and power — but everything worth buying is deeper, and depth costs the only currency that matters: **air**. Reach the Heart of the cave at the bottom, bring it back to daylight, and you win — if the rounds don't outscale you first, and if you can still find your way out.

## 2. Pillars

1. **Decisions must matter.** The game is a *race*, not an endless treadmill (see §4). Every point spent, every minute used, moves you toward winning or losing the race. No strategy exists that trivializes the game by repetition.
2. **Air taxes everything; the round clock caps everything.** Below the surface you are always spending air, so chores (box hits, perk runs, battery runs) are never free — the crawler's *purpose* (a safe chore window) doesn't exist here. The round-freeze half of crawler-keeping is closed by rule instead: the Cave Stirs countdown (§9) means no round can be held open. Two mechanisms, one promise: there is no repeatable safe state.
3. **Navigation is a skill, being lost is tension — not frustration.** The cave is confusing by design, but the game always gives honest tools: bubbles rise toward the surface, the depth gauge never lies, guide lines and chemlights let the player author their own wayfinding. Getting lost is the player's failure to use tools, never the game hiding the answer.
4. **Fear through impairment, never blindness.** Silt, darkness, and tilt *degrade* information (shorter sight lines, tighter beam, wrong-feeling up). They never zero it out. There is always something to read: the line in your hand, the glow of a chemlight, rising bubbles, the gauge.

## 3. Changes from the original brief (and why)

The original asks are all in (see traceability table §18). These are the load-bearing *additions/changes* I made:

| Change | Why |
|---|---|
| **Win condition is a race** (§4): rounds eventually outscale any build; you must make the Heart run before they do | Directly fixes the stated BO1-successor complaint: no infinite crawler-stall meta, no "nothing mattered" high-round wall. The wall *is* the point — it's the race deadline. |
| **Timed intermissions + the Cave Stirs countdown** (§9): next round starts on a timer wherever you are, and a nearly-cleared round auto-advances after a visible countdown (the user's mechanic, 2026-07-18) | Breath taxes chores, but only a rule can stop round-freezing. This closes crawler-keeping entirely. |
| **Guide line reel + chemlights** (§6.6): player-deployed breadcrumbs, followable by feel in a silt-out | Getting lost must be recoverable through skill (pillar 3). Also the single most iconic real cave-diving practice — free horror authenticity. |
| **Bubbles always rise + depth gauge** (§6.5): honest "which way is up" tells during tilt | Tilt disorientation without an honest tell is nausea, not fear. |
| **Light discipline in the Abyss** (§8.4): Guardians aggro on your flashlight | Makes light itself a decision, and makes the deepest zone play differently from everything above it. |
| **Surface decay** (§5.1): the safe spawn pool becomes contested from round 5+ | The surface must not become the crawler-camp substitute. |
| **The Angler** (§8.2): an enemy whose lure mimics a friendly light | Weaponizes the player's own navigation trust. Cheap to build, huge dread. |
| **Setting is a facility fused through the cave** (user asked cave vs. flooded nuclear facility, 2026-07-18): natural cave is the connective tissue, the 1960s nuclear site intrudes more densely with depth; the Throat is the site's own bore | Keeps the cave-diving horror and the procedurally-strong organic geometry; man-made pieces become isolated, readable landmarks instead of corridor systems demanding asset quality we can't produce (the Venice Beach trap). Full identity in LORE.md §3. |
| **Door buys** (§10.3): debris chokes, grates, and site hatches bought open with points; each opens once and never re-closes | Restored at the user's request — buying territory is core BO1 fun. Consistent with "passages never close": a door only ever *adds* passage. Consumable sinks (batteries, reels, chemlights) stay too. |

## 4. The Race (macro structure)

- Rounds scale forever, and past ~round 25 the HP curve steepens into an intentional wall. There is no winning by outlasting.
- The intended winning arc: **power by round 4–6 → 2–3 perks by round 8–10 → Pack-a-Punch by round 12–15 → Heart run at round 15–20.** Mandatory door spend on the way down (~5500, §10.3) is part of the budget. Go too early: the Abyss kills you. Go too late: rounds crush the ascent. The player's economy/routing decisions determine where in that window they land — that's the whole game.
- A winning run should take **40–70 minutes**. No saves; death ends the run (Second Wind excepted). Roguelike posture.
- Score screen on win/loss: rounds survived, kills, points earned, time, deepest depth reached, whether Second Wind was consumed.

## 5. The Cave

**Layout is authored data** (`src/cave/data.ts`), not sculpted geometry: a graph of nodes (chambers/junctions, with position, radius, zone, tags, contents) and edges (tunnels, with width class and control points). Renderer, collision, pathing, and the debug map viewer all derive from this one file. §16 has the schema.

### Global layout rules (the data must satisfy these; the map viewer should assert them)

- **Two-route rule:** in the *fully-opened* cave there are ≥2 fully disjoint routes between the surface and each zone hub, so a silt-out can always be swum *around*. Early on, with few doors bought, fewer options exist — acceptable, because silt never physically blocks a passage (worst case: line-feel through it, §6.6). Dead ends hang off the routes; they never gate progress.
- **Door rule:** progression doors sit on the main route into each zone (§10.3); each zone also has an alternate way in that is either free-but-nasty (a squeeze) or a purchasable shortcut. Closed doors block zombies and player alike; zombies never open doors; open doors never close.
- **Air rule:** every point in Surface/Galleries/Maze is ≤ ~45 s at base swim speed from an air source. The Throat→Abyss stretch deliberately breaks this (~60–75 s) — that's the commitment moment of the game.
- **≥1 passage that is dead-vertical** (the Throat), long enough to lose the sense of up (≥25 m).
- **Squeezes:** ≥4 total. A squeeze is single-body-width: forced slow speed, no turning around mid-squeeze, no shooting while inside, zombies can enter behind you.
- **Dead ends:** ≥8 total, some rewarded (caches), some empty. Empty dead ends are load-bearing: they teach that exploration costs air and might pay nothing.
- **Look-alike junctions in the Maze, distinct landmarks at key decisions.** Landmark nodes get a tag and a bespoke visual treatment (named formations). Confusion comes from similarity between minor junctions, never from key routes being unreadable.

### 5.1 Zones

| Zone | Depth | Role | Contents |
|---|---|---|---|
| **The Sinkhole** (surface) | 0–17 m | Spawn. Open cenote: daylight shaft, **dry rock shore with Lowe's camp**, calm pool. Infinite air with head above water. | 2 wall buys (Speargun 500, Pneu-Driver 1000), 3 burrows. Burrows activate progressively; from round 5+ zombies climb into the pool itself — the surface stops being safe. |
| **The Galleries** | 10–25 m | First real diving. A ring loop + 4 dead-end spurs (2 cached, 2 empty). | Power generator room at the far side of the ring. 2 perk stations, box location A, 2 wall buys, 3 air pockets (1 ambush-capable), 1 squeeze shortcut across the ring. |
| **The Maze** | 25–45 m | The disorientation zone. Lattice of look-alike junctions; landmarks: the Organ Pipes, the White Chapel (chalk-mound room), the Coil. | ≥5 dead ends, 3 squeezes, tilt zones at 2 thresholds, 3–4 chalk mounds, box location B, 3 perk stations, 2 wall buys, 3 air pockets. Two disjoint routes to Galleries and to the Throat rim. |
| **The Throat** | 45–60 m | The vertical shaft. 25 m straight down. Max-strength tilt zone. Chalk mounds at the rim (a silt-out inside a vertical shaft is intended nightmare fuel). | One air-pocket niche at the top rim. Squeeze exit at the bottom. |
| **The Abyss** | 60–75 m | Endgame. The Cathedral: one grand chamber + side passages, faint bioluminescence (navigable with light off, barely). | Pack-a-Punch (unsealed by power), 2 Guardians patrolling, the Heart in the apse, 1 perk station, box location C, 1 air pocket hidden behind a squeeze. |

Diegetic dressing: the cave holds **Site BLACKWATER**, a drowned 1960s naval nuclear installation built along its own dig — berthing shallow, stores mid, the reactor ("the Pile") and drill head deep; the Throat *is* the bore. The facility-through-cave gradient, every object's in-world identity, and all appearance directives live in **LORE.md** (§3–§4 there). Homage tone, no real-brand assets.

## 6. Player systems

### 6.1 Movement (6DOF swim)
- Mouse-look; WASD relative to look direction; **Space/C are CAMERA-relative up/down** (your head's up, not the world's — under tilt, the controls follow your disorientation and only bubbles/gauge tell world-truth; user decision 2026-07-18). Shift sprint. Full freedom to swim any direction, including inverted.
- **Ambient current (user, 2026-07-18, raised twice — "a constant challenge"):** everywhere below the surface, a wandering current with a strength FLOOR (~0.9–2.4 m/s vs 4 m/s base swim) — never a lull, always fighting you or carrying you, strong enough to shove a heavy body into shaft walls. Damped ×0.3 inside squeezes so peak current can never pin you in a crack. It moves your *position*, never your camera. Honest-tells guard: bubbles and gauge stay truthful.
- **Heavy force-based swimming (user, 2026-07-18 ×2 — "moving a 300 lb object"):** weak directional thrust + near-zero water drag. From rest to top speed takes ~6 s of held input; a coasting body keeps ~70% of its speed over 3 s (drag is the only brake — the speed cap never brakes a coast); reversing direction takes seconds of fighting your own momentum; wall impacts bleed the velocity component into the wall. Streamline (holding one direction) raises the speed cap toward sprint speed without sprinting; direction changes dump it; sprint = faster thrust + faster streamline + the lunge burst. Enough momentum breaches the surface in a dolphin arc.
- **Lunge (user, 2026-07-18):** triggering sprint fires a quick forward lunge impulse, on a short cooldown ("lunge protection"); in a squeeze the lunge still fires but much smaller. Lunging spikes heart rate — with the HR lag, the cost lands a beat later.
- **Jump on land (user, 2026-07-18):** Space jumps while walking on dry ground — high and snappy (~1.7 m, coyote-time grace) so a running jump off the shore is a proper dolphin dive.
- **Current is quick-shifting:** direction AND strength randomize over time — transitions smooth but fast (user revision of the ambient-current spec).
- Base swim **4.0 m/s**, sprint **6.5 m/s** (air drain ×1.6), squeeze forced **1.6 m/s**. Momentum: ~0.4 s to reach speed, ~0.6 s glide to stop. On the platform: walk 5 m/s (trivial).
- Swimming fast (< 1.5 m above a silty floor) or sprinting in silty chambers stirs ambient silt (§7.1). Slow swimming is clean. Careful movement is a real, always-available skill.

### 6.2 Air & heart rate (user redesign, 2026-07-18)
- **Heart rate is the oxygen clock.** HR rests at 60 bpm and rises smoothly with a lag of a couple of seconds: sustained sprinting climbs it slowly toward ~150; a lunge spikes it; taking a hit spikes it; the reserve breath (below) pins it near max. Recovery is slower than the rise.
- **Air drain scales with HR:** drain = 1/s × (HR/60) × zone multiplier (Surface/Galleries ×1.0, Maze ×1.1, Throat/Abyss ×1.25). Sprinting costs air *through your pulse* — the old flat sprint multiplier is gone. A zombie grab rips the regulator: **−8 air**, HR spike, brief tilt kick.
- **The reserve breath:** when the tank hits 0, the bar refills once — flashing red — and drains fast (~8 s): your last breath, and the game's clearest "you are about to die" signal (the ambient pass hooks Lowe's genuine panic to this state). When it empties, drowning damage begins. The reserve re-arms only after refilling past 50 air.
- Tank of **100 air**.
- Refill at surface or any air pocket at 25/s (4 s full). Low-air state at ≤25: heartbeat, breath sounds shorten, screen-edge desaturation. At 0: **drowning** — 15 HP/s. (Grace, not instant death; reaching a pocket while drowning is a designed panic beat.)
- **Three air pockets are dry rooms** (data `dry`): FULL rooms with real walkable floor above a local water line (Galleries west dome, the infirmary airlock, the Throat rim niche) — dry benches you climb out onto, not just breathing gaps (user, 2026-07-18 ×2: "they should be full rooms").
- Air pockets are open to zombies occasionally (ambush-capable pockets are tagged in data): surfacing into one is relief, not guaranteed safety.

### 6.3 Health
- 100 HP. Drowned grab: 35. Guardian hit: 70. BO1-style regen: after 5 s without damage, full over ~4 s. Down at 0 → death (run over) unless Second Wind (§10.5).

### 6.4 Flashlight & batteries
- Primary light. **300 s of on-time** per battery; below 50% output dims progressively; below 20% it flickers. Toggle anytime (F). Light is also information *given away* — see Guardians (§8.4).
- Batteries: wall buy (250) and a guaranteed drop from Anglers; restore to 100%. Powered string lights (§10.4) cover main arteries so flashlight becomes a choice on known routes, a necessity off them.

### 6.5 Tilt (disorientation)
- Tilt zones (tagged edges: thermocline currents, squeeze exits) drift camera **roll** while inside at 15°/s, up to a per-zone max: 30° Galleries, 90° Maze, **180° Throat** (fully inverted is possible where the brief wanted it).
- Outside a zone, roll decays 2°/s naturally. Hold X: actively re-level at 45°/s toward true-up. Honest tells: **exhaled bubbles always rise world-up** (player exhales a visible stream every few seconds), and the depth gauge trend arrow. Never fake these.
- **Accessibility (required):** settings slider caps max tilt 0–180°. Default 180°. This is a motion-sickness issue, not a difficulty option; label it clearly.

### 6.6 Guide line & chemlights (player-authored navigation)
- **Guide line reel:** start with one 200 m reel. Anchor at the platform (or any tie-off within 2 m), auto-pays out while swimming; tie off at intermediate points (Q); re-reel by walking it back from either end. Within 1.5 m in silt/darkness: **follow mode** — hand-over-hand glide along the line at 3.5 m/s regardless of visibility. Extra reel: wall buy 750 (max 2 deployed / 400 m). Zombies do not cut lines (v1).
- **Chemlights:** green glow sticks, 10-pack for 250. Toss or place (G). Persist for the run, world cap 40 (oldest fade). Marking cleared dead ends is the intended use — the game never does it for the player.

## 7. Silt

### 7.1 Ambient silt
- Silty-floored chambers (tagged): fast/low swimming stirs a local cloud — visibility in the patch drops ~35 m → ~12 m, settles over ~20 s. Teaches the movement discipline that the endgame demands, at low stakes.

### 7.2 Silt-out (the trap)
- **Chalk mounds:** pale, bulbous stacked formations with a faint particle shimmer — visually learnable at a glance, distinct silhouette. Placed (in data) guarding valuables and key junctions, 6–10 total, Maze and deeper.
- **Shooting one or touching one detonates it instantly:** chamber-wide visibility collapses to **4 m**, flashlight backscatters (beam auto-narrows 60°→25°, shorter throw), sound goes cottony. Fades over **75 s**; when fully cleared, the mound **re-arms** (per the brief).
- Fully avoidable with care: don't shoot near them, swim slow and wide. Fights near mounds are the game asking "discipline or firepower?"
- Silt-outs never block a passage — they make it *unreadable*, forcing either line/chemlight skill or the two-route rule's alternate path.
- **Silt Shades** (§8.3) spawn only during silt-outs from round 10+ — silt-outs escalate from navigation problem to hunt.

## 8. Enemies

All enemies swim; all path on the cave graph + local steering (§16). Spawn from **burrows** (tagged nodes — cracks/vents) near the player's current zone, ≥12 m away, out of sight preferred. (In-fiction: the site keeping its complement — LORE.md §1.1; endless round spawning is the central wrongness made load-bearing, not a hole.)

### 8.1 The Drowned (base)
- Site personnel, 40 years drowned. Speed 2.8 m/s at round 1, +0.12/round, cap 5.5 (player sprint 6.5: always escapable — for air). HP 150 at round 1, ×1.12/round through 20, ×1.18 after (the wall). Grab: 35 dmg, −8 air, tilt kick (grabs read as *procedural handling*, not mauling — LORE.md §2).
- Death animation: go limp and *drift* — corpses hang in the water briefly. Free atmosphere.
- Variants deliberately few; the same men recur and the player is meant to notice (LORE.md §4 directive — our small procedural model count is canon). Idle behavior near facility props: pause mid-pursuit as if remembering a task.

### 8.2 The Angler (round 8+)
- Ambusher that hangs in dark side passages showing only a **dim warm lure light** — deliberately mimics distant string lights/chemlights at a glance (subtly wrong color temperature: learnable). Within ~10 m: 8 m/s lunge. 1 per round +1 per 5 rounds, max 3 alive. Always drops a battery.
- Teaches: never trust a light you didn't place. The counter is chemlight discipline (your greens are unambiguous).

### 8.3 The Silt Shade (round 10+, silt-outs only)
- Spawns only while a silt-out is active. 5 m/s inside silt, 2 m/s in clear water. Normal grab damage. Despawns (dissolves) when the silt fully clears.

### 8.4 Abyss Guardians (Abyss residents)
- 2 patrolling elites in the Cathedral. Slow (2.5 m/s), massive HP (roughly 20× a same-round Drowned), 70-dmg hit. Respawn next round if killed. **Aggro is sensory:** flashlight on = noticed at 18 m; sprinting = 25 m; light off + slow swim = 6 m. The Abyss's bioluminescence exists so lights-off sneaking is genuinely playable. Fighting them is a choice; sneaking past is the designed default until heavily built.

## 9. Rounds & pressure

- Round N spawns `6 + 4N` Drowned (cap 60/round), max **9 alive** (perf + readability). Kill all → round ends → **40 s intermission on a global timer** → next round starts wherever the player is. No "take a break when ready."
- **The Cave Stirs (anti-crawler rule, user's design):** when a round's remaining zombies drop to ≤ max(3, 15% of the round total), capped at 10, a visible countdown starts — **45 s**, "the cave stirs…" — and when it expires the next round begins regardless. Survivors carry over (they count against the 9-alive cap). A round cannot be held open; there is no keepable crawler *by rule*, not by pressure.
- Specials per §8. Round transitions: somber horn stinger + round tally flicker (BO1 homage, original assets).

## 10. Economy

Points: **10/hit, 60/kill, 100/headshot kill, 130/melee kill.** Start with 500.

### 10.1 Wall buys (fixed locations in data; ammo refill = half gun cost)
| Item | Cost | Zone |
|---|---|---|
| Speargun (8/reserve 40, strong single) | 500 | Sinkhole |
| Pneu-Driver SMG (24/120 pneumatic darts) | 1000 | Sinkhole |
| Flechette Scatter (shotgun) | 1250 | Galleries |
| Harpoon Rifle (slow, piercing, heavy) | 1500 | Galleries/Maze |
| Line Lance (fast stab, 2-target pierce, melee range) | 1750 | Maze |
| Battery | 250 | several |
| Chemlight 10-pack | 250 | several |
| Guide reel | 750 | Galleries |

Starting loadout: Wrist Dart (weak dart pistol), Dive Knife (melee, always available), 1 reel.

### 10.2 Mystery box — 950/spin
- Locations A (Galleries), B (Maze), C (Abyss); relocates among them on a BO1-style rare tease-then-move. Pool: all wall guns + box-only: **Twinfish** (akimbo spear pistols), **Arc Projector** (chain lightning — water conducts; room-clearer, rare), **Vortex Maw** (pulls a crowd into a point; utility), **Sonic Lance** (piercing beam), **Bang Stick** (one-hit melee replacing knife, BO1 ballistic-knife energy).

### 10.3 Doors — buy open, never re-close
Classic territory purchases, underwater: debris chokes, rusted grates, and the site's crank-wheel bulkhead hatches. Buying one (hold E) grinds it open with a brief local silt puff (cosmetic-scale risk, on theme); it stays open for the rest of the run.

| Door | Cost | Kind | Role |
|---|---|---|---|
| Sinkhole → Galleries (main artery) | 750 | debris | progression (free alternate: squeeze crack) |
| Galleries ring shortcut | 1000 | grate | optional shortcut |
| Galleries → Maze (main) | 1250 | debris | progression (free alternate route: long and dark) |
| Maze internal shortcut | 1250 | grate | optional shortcut |
| Maze → Throat rim | 1500 | debris | progression |
| Throat bottom → Abyss (pressure hatch) | 2000 | hatch | progression comfort — the free alternate is a nasty no-turn squeeze; pay once or squeeze every trip |

Mandatory spend to reach the Abyss comfortably: ~5500. Costs are v1 guesses (`tuning.ts`).

### 10.4 Power
- One switch, the **Pile room** (the site's small experimental reactor), far end of the Galleries ring. On: perk stations light up and vend, cherenkov-tinted **string lights** trace the two main arteries (Sinkhole↔Galleries↔Maze hub), PaP grate in the Abyss grinds open (opens once, never re-closes — consistent with "passages never close"). Turning on power is the first real dive: the moment the game starts.

### 10.5 Perks — pick 4 of 9, stations fixed in data, power required
| Perk | Cost | Effect |
|---|---|---|
| Barnacle Hide | 2500 | HP 100 → 220 |
| Second Wind | 1500 | On death: blackout, wake at last-used air pocket with sidearm, lose this perk. **Non-stackable, one held at a time.** Re-buyable after use. |
| Greased Gears | 3000 | Reload ×0.5 |
| Trigger Fish | 2000 | Fire rate +30% |
| Deep Pockets | 4000 | 3rd weapon slot |
| Iron Lungs | 2500 | Air 100 → 150, drain ×0.85 |
| Cat Eyes | 2000 | +40% visibility in silt/dark, wider beam, less backscatter |
| Fin Kick | 2000 | Swim +15%, sprint air cost ×0.8 |
| Steady Hands | 1500 | Your movement never stirs ambient silt; tilt decays 3× faster |

The 4-cap is the identity system: tank build, ghost build (Cat Eyes/Steady Hands/Fin Kick), gun build. Machines have BO1-style jingles (§14).

### 10.6 Pack-a-Punch — 5000, the Abyss
- ×2.5 damage, bigger mag, flavor rename, per-gun quirk, and the universal rule: **PaP projectiles emit light.** An upgraded gun is also a navigation tool — tracer-lit tunnels, and shots that give your position away. PaP ammo refill: 4500.

### 10.7 Drops (from kills, ~2% + pity timer)
Max Ammo · Double Points (60 s) · Insta-Kill (30 s) · **Clear Waters** (all silt settles instantly — re-arms mounds — + slight vis boost 30 s) · **Battery Surge** (full battery) · **Pressure Wave** (kill all alive, rare).

## 11. The Heart & endgame

- The **Heart of the Cave** sits in the Cathedral apse: a slow-pulsing biolum mass (what the site was drilling toward). Grabbing it is allowed any time you can physically reach it — the Guardians and the swim are the gate, not a flag check.
- Grabbing it starts the **Ascent**: continuous fast spawning everywhere, all zombies at the speed cap, global light stir (visibility down one grade), Guardians pursue beyond the Abyss. The Heart glows in your hands — you can see, and everything can see you. Weapons still usable (Heart stows on fire, glow persists).
- Reach the surface platform → **WIN.** No hard timer: air pockets still work, the swarm just never stops. Air and routing are the real timer. A pre-laid guide line up the Throat is the intended "I planned for this" payoff.
- Death during the Ascent = death (Second Wind still works; the Heart drops where you died, must be re-grabbed).

## 12. HUD / UX

Minimal, diegetic-leaning: O2 bar + number (bottom-left), ammo + battery pips (bottom-right), points (top-right, +delta ticks), round tally (top-left), small depth gauge + trend arrow (bottom-center). Grab = regulator-rip flash + bubbles. Damage vignette. Hitmarkers subtle. Screenshot mode (debug) hides HUD.

Run intro: **the job sheet** (LORE.md §2.3) as a skippable styled text card — it is how the player learns the objective (bottom of the bore, carry the Heart to daylight) plus two tutorial seeds, delivered in-world as a clinical recovery contract with one impossible detail. Posters/blueprint/photos support **inspect** (look + E → fullscreen overlay; LORE.md §7 readability rules). Tapes: collected on pickup, auto-play at the next safe surfacing (no enemy within ~20 m), replayable from pause (LORE.md §5).

Menus: title (Dive / How to Dive / Settings), pause (incl. recovered-tapes list), death screen with stats, win screen with stats. **Stats screens are written as Lowe's ledger** (LORE.md §2): e.g. `RECOVERED: 214 / ROSTER: 41 / DISCREPANCY: noted` — kills, tapes, toys, rounds, time framed as recovery paperwork; the win screen ends on the forty-two beat (LORE.md §2.2 final lines). Settings: mouse sensitivity, invert Y, FOV, **max-tilt slider**, brightness, master/music/SFX/VO volume, subtitles (radio logs).

"How to Dive" teaches in ≤10 lines: air, line, chemlights, bubbles rise, mounds detonate, lights attract.

## 13. Difficulty & fairness rules

- Zombies never spawn within 12 m or in the player's line of sight when avoidable.
- Every impairment has a counter the player can hold: silt→line/chemlights/Cat Eyes, dark→battery discipline/string lights, tilt→bubbles/gauge/X, air→pockets/Iron Lungs/routing.
- The game never moves the player's chemlights or line, never randomizes layout mid-run. The cave is fixed per run (single authored layout v1; procedural variation is out of scope).
- Sound is honest: zombie moans are distance/occlusion-attenuated truthfully; no fake far moans.

## 14. Audio (ElevenLabs + WebAudio)

- **Global underwater DSP:** low-pass + light convolver on everything below surface; lifts when head breaks water — the transition *is* the surface-relief feeling.
- **Breathing loop** tied to air level (calm → ragged), heartbeat under 25 air; regulator hiss per exhale (synced to the visible bubble stream = the up-tell has a sound).
- Zombie moans (wet, muffled), Angler lure hum (faint wrong-feeling chord), Guardian sub-bass presence, silt-out "whump" + tinnitus dip, perk jingles (short, dark-goofy originals), round stingers, PaP choir-groan, box music-box tease, faint geiger crackle near the Pile room (pure flavor — there is no radiation mechanic, and nothing may imply damage).
- **Radio logs:** 6 waterproof tape players in data-tagged spots; scripts are final in LORE.md §5 (Site BLACKWATER crew, 1968, increasingly wrong). ElevenLabs VO. Subtitled. Skippable. Collected on pickup; play at the next safe surfacing, never at depth (LORE.md §5 playback spec). Pure flavor, zero mechanics.
- **Player VO — Lowe:** speaks ONLY with his head above water (platform, air pockets, menus) — never below (regulator in; his underwater silence is the horror discipline). Line list + character voice in LORE.md §2 (soft-spoken recovery diver; fear registers as increased politeness). Tape reactions queue until he next surfaces.
- **Easter egg — "Still on Shift":** three wind-up toy divers hidden in dead ends (data tag `toy`); winding all three wakes the rec-room jukebox, which plays one track game-wide through the underwater DSP, once per run. Track source: a random MP3 from `public/music/easteregg/` — try ElevenLabs Eleven Music (it does lyrics) at M8 for track one; the user can drop Suno tracks (prompt + full lyrics in LORE.md §6) into the folder anytime, zero code.
- Generation: ElevenLabs TTS for VO + sound-effects endpoint for moans/stingers where it shines; WebAudio synthesis fallback for anything it can't do. All audio generated once at Milestone 8 and committed as static files — runtime never calls external APIs.

## 15. Art direction

- Everything procedural (no modeling tools available): the cave mesh comes from a signed-distance field (union of tunnel capsules + chamber spheres from the graph, warped by 3D noise) extracted with marching cubes — watertight organic caves with overhangs, layered crossings, and irregular junctions for free. Triplanar-noise rock shader, instanced particles (silt, bubbles, motes), billboard god-rays only at the sinkhole shaft.
- **Murk is the art style.** Fog and darkness hide low fidelity; silhouettes carry: Drowned = ragged humanoid drift, Angler = a light with a suggestion of a body, Guardian = large slow occlusion of the biolum field, Heart = warm pulse in cold water.
- Palette by depth: sun-dappled teal (Sinkhole) → grey-green (Galleries) → near-black with pale chalk formations (Maze) → black with cyan biolum accents (Throat/Abyss). PaP/perk stations: small saturated color signatures — the only saturated things down there.
- Post: vignette, slight chromatic aberration scaling with tilt, subtle screen-space particulate always.
- **Flat diegetic media via Gemini:** posters, the site patch, perk labels, blueprint, crew photo, title art — full manifest with prompts in LORE.md §7; rendered as textured quads at data-tagged spots. Procedural canvas-text fallbacks so the game never blocks on generation quality. Everything else stays procedural.

## 16. Technical architecture & development rules

**Stack:** TypeScript (strict) + Three.js + Vite. No other runtime deps without a PLAN.md note. Tests: Vitest for pure logic (economy, air math, round scaling, graph connectivity); everything visual verified via the browser preview + debug harness.

**Map-as-data:** `src/cave/data.ts` exports the graph:
```ts
type NodeId = string;
interface CaveNode { id: NodeId; pos: [number, number, number]; radius: number;
  stretch?: [number, number, number]; // rooms are ellipsoids, not spheres
  pillars?: number;                   // solid rock columns (path-clearance guaranteed)
  dry?: boolean;                      // air pocket with walkable dry floor + local water line
  zone: 'sinkhole'|'galleries'|'maze'|'throat'|'abyss';
  tags: ('airPocket'|'ambushPocket'|'burrow'|'landmark'|'siltyFloor'|'chalkMound'|'tiltZone'
        |'perk'|'wallBuy'|'boxSpot'|'power'|'pap'|'heart'|'tape'|'cache'|'tieOff'
        |'poster'|'toy'|'jukebox')[];
  contents?: { perk?: PerkId; wallBuy?: WeaponId; landmarkName?: string; burrowActiveFromRound?: number };
}
interface CaveEdge { a: NodeId; b: NodeId; width: 'open'|'normal'|'squeeze';
  waypoints?: [number,number,number][]; tilt?: { maxDeg: number };
  door?: { cost: number; kind: 'debris'|'grate'|'hatch' }; }
```
Geometry, collision, zombie pathing (A* on the graph + local steering inside chambers), spawn logic, minimap-less navigation logic, and the map viewer all read this. **Nothing is ever hand-placed in renderer code.**

**Map viewer (my "napkin sketch"):** `?view=map` renders the graph as labeled 3D wireframe + orthographic top and side projections, color-coded by zone/tags, and runs the layout-rule assertions from §5 (two-route rule via graph check, air-rule via BFS with swim speed, counts of squeezes/dead ends). I verify layout by *screenshotting this view*, not by reading coordinates.

**Debug harness (`?debug=1`, built in Milestone 0–1, maintained forever):** panel + hotkeys for: teleport to any node, give points/weapon/perk, spawn N Drowned at node, start round N, trigger/clear silt-out, toggle god / infinite air / infinite battery, fog off, freefly noclip, time scale, hide HUD, deterministic seed. **Every feature ships with its debug trigger in the same milestone** — features I can't reach in 10 seconds don't get verified, and unverified features are the Venice Beach failure mode.

**Development rules (the lessons):**
1. Layout lives in one data file; docs state requirements; the viewer proves them. Never reconstruct intent from scattered code.
2. All gameplay numbers in `src/tuning.ts`. No magic numbers inside systems.
3. One language. Small modules (~≤400 lines), one system per directory: `cave/ player/ zombies/ economy/ effects/ audio/ ui/ debug/`.
4. Verify in the browser (screenshots) before checking anything off. The repo must run cleanly (`npm run dev`) at the end of every session.
5. Commit at every milestone + WIP commits mid-milestone. `.env` is never committed.
6. Perf budget: 60 fps on integrated graphics; ≤9 zombies alive; ≤20k instanced particles; check the FPS counter every milestone.

## 17. Tuning philosophy

v1 numbers above are deliberate guesses shipped fast. Milestone 9 is a real playtest loop: I play full runs with cheats off, log where I died/got bored/got rich, and tune `tuning.ts`. Priorities in order: (1) air pressure is felt but shallow loops are comfortable, (2) the race window lands at rounds 15–20, (3) a first-time player's death feels attributable ("I stirred that," "I trusted the wrong light"), never random.

## 18. Original-brief traceability

| Brief ask | Where it landed |
|---|---|
| Surface easy, must go deeper for upgrades | §4 race arc, §5 zone contents |
| Long passages, dead ends, easy to get lost | §5 rules, Maze |
| Camera tilt, possibly upside down | §6.5 (180° in the Throat), accessibility slider |
| Tight squeezes, fear of dying stuck | §5 squeeze rules (no turning, no shooting) |
| Air pockets | §6.2, ambush pockets §6.2/§5 |
| Flashlight dims, batteries | §6.4 |
| Visibility reduction, carefully designed; silt; tighter beam | §7, pillar 4 |
| Perks: health, extra life, reload, fire rate, extra weapon + game-specific | §10.4 (9 perks, pick 4) |
| Passages never close; silt forces a different path back | §7.2 + two-route rule §5 |
| Win = reach deepest point and return | §11 |
| Box, power, wall buys, PaP | §10 |
| Door buys (added back at user request, 2026-07-18) | §10.3 |
| Lore/worldbuilding step; coherent world; asset appearance dictated (user, 2026-07-18) | LORE.md (whole file); §3, §5.1, §14, §15 here |
| Flooded nuclear facility (user question, 2026-07-18) | Hybrid: facility fused through the cave — §3, §5.1, LORE.md §3 |
| Player character, motivations, out-of-water voice lines (user, 2026-07-18) | LORE.md §2; §14 VO rules |
| Easter egg music à la BO1 teddy bears (user, 2026-07-18) | §14; toys/jukebox in LORE.md §6; MP3 folder + Suno prompt there |
| Silt-out object: instant on shoot/touch, avoidable, fades, re-arms | §7.2 chalk mounds |
| Swim in any direction | §6.1 |
| ≥1 passage straight down | The Throat §5.1 |
| Decisions matter / no crawler-stalling / no pointless high rounds | Pillars 1–2, §4, §9 Cave Stirs countdown + timed intermissions |
