# BLACKWATER — Design Document

Working title: **BLACKWATER** (Black Ops 1 zombies × cave diving). Solo-only, single-run, browser game.

> **DESIGN LOCK LIFTED 2026-07-21 (user-directed redesign round).** The 2026-07-18 lock stood through M8d. On 2026-07-21 the user reopened the design with a major feedback round: **the economy moves from points-buys to found items** (§10), **rounds become time-based shifts with a map-wide wandering population** (§9), the Angler is reworked and the Lamp Man added (§8), the Museum Annex + concept-art gallery are added (§12.1), and the voice/music doctrine changes (in-head VO, one-song/one-voice arbitration, §14). Sections below are rewritten to the new design; PLAN.md M11+ carries the build order. Outside those sections the 2026-07-18 rules still hold: implement, tune, fix — don't freelance-redesign.

> **How to use this document (note to future me):** This file is the source of truth for *what the game is*. PLAN.md is the source of truth for *what to do next*. LORE.md is the source of truth for *why the world looks and sounds the way it does* — setting, player character, VO, every asset's in-world identity and appearance, tape scripts, the easter egg song, and the Gemini image manifest. Build nothing player-visible without checking LORE.md. When implementation reality diverges from this doc, update the doc in the same session — never let the code become the only record of a decision. Once `src/cave/data.ts` exists, it is the source of truth for the *layout itself*; this doc only states layout *requirements* the data must satisfy. All gameplay numbers below are v1 guesses — they live in `src/tuning.ts` once coded, and Milestone 9 (balance) owns changing them. When tuning changes a number, update it here only if the *design intent* changed, not for every nudge.

---

## 1. Pitch

You are a diver at the lip of a flooded sinkhole that leads down into a drowned Cold-War research site. Every round, the drowned dead come for you. Points buy weapons, perks, and power — but everything worth buying is deeper, and depth costs the only currency that matters: **air**. Reach the Heart of the cave at the bottom, bring it back to daylight, and you win — if the rounds don't outscale you first, and if you can still find your way out.

## 2. Pillars

1. **Decisions must matter.** The game is a *race*, not an endless treadmill (see §4). Every minute used moves you toward winning or losing the race. No strategy exists that trivializes the game by repetition.
2. **Air taxes everything; the shift clock caps everything (rewritten 2026-07-21).** Below the surface you are always spending air, so chores are never free. And the shift clock is *pure time*: shifts advance whether you fight, hide, or explore — killing buys nothing and stalling saves nothing (§9). The old anti-crawler machinery (kill-gated rounds, the Cave Stirs countdown) is deleted because it's unnecessary: there is no round to hold open. **Killing is self-defense and ledger vanity, never income** — the user found kill-farming for points a chore, so the game no longer pays for it.
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

- Shifts scale forever (mob cap + HP curve), and past ~shift 25 the HP curve steepens into an intentional wall. There is no winning by outlasting.
- The intended winning arc (2026-07-21: paced by *exploration*, not income): **power by shift 4–6 → 2–3 draughts found and drunk by shift 8–10 → the Bench fed by shift 12–15 → Heart run at shift 15–20.** The way down is gated by found materials (dynamite, keys, §10.3) and one deliberate toll: the Abyss hatch costs **+5 shifts** to crank open. Go too early: the Abyss kills you. Go too late: shifts crush the ascent. The player's routing/search decisions determine where in that window they land — that's the whole game.
- **The game is winnable without killing a single Drowned.** Progression never requires a kill; weapons exist to buy you room, not levels. (Zero-kill runs get their own ledger line — `RECOVERED: 0 / DISCREPANCY: none. First time for everything.`)
- A winning run should take **40–70 minutes**. No saves; death ends the run (Second Wind excepted). Roguelike posture.
- Score screen on win/loss: shifts survived, kills (vanity tally), time, deepest depth reached, whether Second Wind was consumed.

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
- **Air is physically coherent (user rework 2026-07-18, water model v2 2026-07-19):** every air region (bell, dry passage) carries its own local water surface in data — rooms as a `water` fill fraction along their (false) up that moves and tilts with the room, tunnels as an `airGap` hugging the ceiling; `dry` with no water field is all air. Water exists only below the surface, entrances to bells arrive from below the line, and a room's air is always held by rock — never water floating beside air. Walkable air rooms get flat(ter) floors (`floor`, soft smooth-max edges — rooms must not read as spheres) with the pool only where the entrance shaft pierces the floor. Implementation rule: a walkable room's floor sits ~one tunnel-radius below the arriving passage centerline so mouths meet floors flush.
- **Open-air passages (user 2026-07-18):** ≥1 walkable dry section (the Dry Reach, off the Galleries west bell): stalactite/stalagmite formations (`spikes`), and visible teaser openings high in the walls that can never be reached — passages above you and to the side, out of reach.
- **The slide (user 2026-07-18):** ≥1 slanted open-air shaft that is wet (`slide` edge): zero traction, gravity hauls you down, you cannot climb back — one-way passages are allowed exactly when an alternate route back exists (two-route rule still holds).
- **Turnaround squeezes (user 2026-07-18):** ≥2 long dead-end squeezes that lead only to a small bulb chamber — big enough to turn around in, which the squeeze itself never is.

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
- **Free-look (user 2026-07-19): the MOUSE is also fully camera-relative** — orientation is a quaternion and mouse movement rotates about the camera's own axes, so under any tilt the controls feel identical; it's the world that has tilted. Walking re-projects to plain yaw/pitch (clamped) for normal first-person feel.
- **Squeeze view cone (user 2026-07-19):** inside a squeeze you cannot turn around — the view is held within a ~30° cone of the passage direction (tunable), mouse speed dying exponentially toward the rim and moving freely back toward center; entering off-axis, your head is pulled forward. This implements the §5 "no turning around mid-squeeze" rule (deferred since M2).
- **Ambient current (user, 2026-07-18, raised twice — "a constant challenge"):** everywhere below the surface, a wandering current (real lulls allowed per the round-4 revision), strong enough to shove a heavy body into shaft walls. **Depth bands (user, 2026-07-19, all knobs in `tuning.ts`): ×0.7 at 0–50 m, ×1.0 at 50–100 m, ×1.7 below 100 m, soft-blended at the boundaries.** Damped ×0.3 inside squeezes so peak current can never pin you in a crack. It moves your *position*, never your camera. **The current is visible: all suspended particles ride it at its true direction and speed** — an honest tell. Honest-tells guard: bubbles and gauge stay truthful.
- **The wet slide (user, 2026-07-18):** on `slide` edges in walk mode, traction is zero: gravity accelerates you down the chute (capped), steering is a tiny lateral nudge, and climbing back is physically impossible — you exit at the bottom and return another way.
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
- **Three air pockets are AIR BELLS** (data `dry` + `floor`): full rooms with a flat walkable floor and a pool hole where the entrance shaft pierces it — you surface in the pool and haul out onto dry rock (Galleries west bell, the infirmary airlock, the Throat rim niche). The smaller pockets are breathing domes: air trapped in the top of a shaft, water below. All of them physically coherent per the §5 air rule (user rework 2026-07-18; benches were replaced by real flat floors).
- The Galleries west bell opens into **the Dry Reach** — a walkable open-air section (stalactite hall, tall gallery with unreachable teaser mouths, and the wet slide down to a flooded plunge pool).
- Air pockets are open to zombies occasionally (ambush-capable pockets are tagged in data): surfacing into one is relief, not guaranteed safety.

### 6.3 Health
- 100 HP. Drowned grab: 35. Guardian hit: 70. BO1-style regen: after 5 s without damage, full over ~4 s. Down at 0 → death (run over) unless Second Wind (§10.5).

### 6.4 Flashlight & batteries
- Primary light. **300 s of on-time** per battery; below 50% output dims progressively; below 20% it flickers. Toggle anytime (F). Light is also information *given away* — see Guardians (§8.4).
- Batteries: wall buy (250) and a guaranteed drop from Anglers; restore to 100%. Powered string lights (§10.4) cover main arteries so flashlight becomes a choice on known routes, a necessity off them.

### 6.5 Tilt (disorientation)
- Tilt zones (tagged edges: thermocline currents, squeeze exits) drift camera **roll** while inside at 15°/s, up to a per-zone max: 30° Galleries, 90° Maze, **180° Throat** (fully inverted is possible where the brief wanted it).
- Outside a zone, roll decays 2°/s naturally. **Q/E roll the camera manually (user 2026-07-19 — X auto-level removed; leveling is the player's own skill).** Breaking the surface (any air) auto-re-levels at 45°/s — the water line hands you your orientation back. With head above water (and in noclip) the mouse returns to traditional first-person (no free-look tumbling while breathing). Honest tells: **exhaled bubbles always rise world-up** (player exhales a visible stream every few seconds), and the depth gauge trend arrow. Never fake these.
- **Deception spaces (user 2026-07-19 — the environment may lie; the tells may not):** regions can declare a `falseUp`. The Listing Room (the big maze bell) is tilted ~30°: floor, stalactites, unreachable tunnels AND the pool surface all follow the lie (user round 8: a flat pool in a tilted room broke the illusion — the water now tilts with `falseUp`, visually and physically), and the camera levels itself to it — the whole room reads as straight. Two maze tunnels carry thin ceiling air gaps with skewed reference-up: surfacing for breath rolls you off-true. The doctrine narrows to: bubbles and the depth gauge never lie — the rock and the water do.
- **Accessibility (required):** settings slider caps max tilt 0–180°. Default 180°. This is a motion-sickness issue, not a difficulty option; label it clearly.

### 6.6 Guide line & chemlights (player-authored navigation)
- **Guide line reel (controls rework rounds 12–13, 2026-07-19 — constant use, in a panic, zero combat-key overlap):** start with one 200 m reel. The line is a NETWORK of strands. Two keys own the whole system, both clear of the shooter set (R reload, F flashlight, LMB fire, RMB/V knife, C swim-down — the knife is a weapon, so melee lives on the mouse per "LMB/RMB weapons"; F stays lamp-only per the M4.7 user-verified decision). **T is the line hand** — *tap*, by context: laying → stop · at a strand's end → resume it · near a strand's MIDDLE → **fork** a new strand tied on at that point (junction knot) · open water → start a new strand, auto-anchored to rock within 2 m instantly (no rock in reach = it trails from your hand); *hold*: ride the line (follow) — strand AND direction latch on engage (a junction never silently switches you; release and re-grab to take the branch), glide hand-over-hand at 3.5 m/s at any visibility with free look. **X is the spool hand** — *tap while laying*: instant tie-off; *tap otherwise*: CUT the nearest tie; *hold near a strand's end*: reel — an active glide toward the anchor that collects the line as you go, walking the strand strictly from its end (jumbled line can't fool it into riding). **Tie-offs PIN the line: reeling stops at a tie** — the stretch behind it is protected until you deliberately cut the tie. Release mid-reel leaves the rest stopped; recover the anchor and the strand stows. **Ctrl grabs the wall** (pure movement brace — no line duties). The HUD kit line always teaches the current options in place (e.g. `LINE END · T resume · hold X reel`, `⟲ PINNED · tap X cuts the tie`). Extra reel: wall buy 750 (max 400 m deployed). Zombies do not cut lines (v1). Known v1 quirk: reeling a parent strand out from under a fork leaves the branch anchored mid-water.
- **Chemlights:** green glow sticks, 10-pack for 250. Toss or place (G). Persist for the run, world cap 40 (oldest fade). Marking cleared dead ends is the intended use — the game never does it for the player.

## 7. Silt

### 7.1 Ambient silt
- Silty-floored chambers (tagged): fast/low swimming stirs a local cloud — visibility in the patch drops ~35 m → ~12 m, settles over ~20 s. Teaches the movement discipline that the endgame demands, at low stakes.

### 7.2 Silt-out (the trap)
- **Chalk columns** (user rework 2026-07-18 — was "mounds"; floor-standing rock piles told you which way was down): pale, bulbous FLOOR-TO-CEILING columns with a faint particle shimmer — orientation-neutral like the rock pillars, visually learnable at a glance, distinct silhouette. Placed (in data) guarding valuables and key junctions, 6–10 total, Maze and deeper.
- **Shooting one or touching one detonates it instantly:** chamber-wide visibility collapses to **4 m**, flashlight backscatters (beam auto-narrows 60°→25°, shorter throw), sound goes cottony. Fades over **75 s**; when fully cleared, the column **re-arms** (per the brief).
- Fully avoidable with care: don't shoot near them, swim slow and wide. Fights near mounds are the game asking "discipline or firepower?"
- Silt-outs never block a passage — they make it *unreadable*, forcing either line/chemlight skill or the two-route rule's alternate path.
- **Silt Shades** (§8.3) spawn only during silt-outs from round 10+ — silt-outs escalate from navigation problem to hunt.

## 8. Enemies

All enemies swim; all path on the cave graph + local steering (§16). Spawn from **burrows** (tagged nodes — cracks/vents) near the player's current zone, ≥12 m away, out of sight preferred. (In-fiction: the site keeping its complement — LORE.md §1.1; endless round spawning is the central wrongness made load-bearing, not a hole.)

### 8.1 The Drowned (base)
- Site personnel, 40 years drowned. Speed 2.8 m/s at round 1, +0.12/round, cap 5.5 (player sprint 6.5: always escapable — for air). HP 150 at round 1, ×1.12/round through 20, ×1.18 after (the wall). Grab: 35 dmg, −8 air, tilt kick (grabs read as *procedural handling*, not mauling — LORE.md §2).
- Death animation: go limp and *drift* — corpses hang in the water briefly. Free atmosphere.
- Variants deliberately few; the same men recur and the player is meant to notice (LORE.md §4 directive — our small procedural model count is canon). Idle behavior near facility props: pause mid-pursuit as if remembering a task.

### 8.2 The Angler (shift 8+; REWORKED 2026-07-21 per user)
An anglerfish — a warm lure light with a suggestion of a huge body behind it. **One alive at a time.** Always drops a battery on death.
- **Patrols the Maze slowly** (graph wander, ~1.5 m/s) with its lure lit.
- **When it sees the player it goes perfectly still.** A stationary distant light — indistinguishable from the Lamp Man (§8.5), which is the point.
- **If the player comes near: the vortex.** It inhales — the player is dragged into its mouth, shaken, and *carried for a few seconds into a different room* while the screen shakes and heart rate pins at max. Then it releases and swims away. No HP damage: the attack costs air (max HR), position, and certainty about where you are. An Angler that has attacked **despawns once it swims out of sight.**
- **Shooting it at range provokes it:** it stops patrolling and swims toward the player — slowly (it is never faster than a sprinting diver) — and attacks on arrival.
- **The Arc Projector is its counter** (user 2026-07-21): the Angler takes bonus arc damage, and every chain bounce re-targets it — a full arc chain lands all its hits on the fish. The PaP'd version even more so.
- Teaches: never trust a light you didn't place — and now, never trust a light that *holds still*.

### 8.3 The Silt Shade (shift 10+, silt-outs only)
- Spawns only while a silt-out is active. 5 m/s inside silt, 2 m/s in clear water. Normal grab damage. Despawns (dissolves) when the silt fully clears.

### 8.4 Abyss Guardians (Abyss residents)
- 2 patrolling elites in the Cathedral. Slow (2.5 m/s), massive HP (roughly 20× a same-shift Drowned), 70-dmg hit. Respawn next shift if killed. **Aggro is sensory:** flashlight on = noticed at 18 m; sprinting = 25 m; light off + slow swim = 6 m. The Abyss's bioluminescence exists so lights-off sneaking is genuinely playable. Fighting them is a choice; sneaking past is the designed default until heavily built.

### 8.5 The Lamp Man (NEW 2026-07-21 — the light that stands)
The Angler was originally conceived as a lamp-carrying figure; the fish shipped instead. Now both exist, and they share one lure: **the Lamp Man's lamp is the exact same color and size as the Angler's** — at a distance you cannot tell which one you are approaching.
- **He stands on the tunnel floor, bolt upright, aligned to TRUE up** (never falseUp — in a tilted region his verticality is itself the tell, for players sharp enough to read it). He never moves. The lamp glow is visible from far off.
- **Spawns every 7 shifts** at the center of a random *normal-width* tunnel in the Maze. Never in squeezes, never in rooms, never twice in the same place in a row.
- **Despawn rules (exactly these, nothing else):**
  1. Player sees him (close enough + looking toward him), then leaves the area for a short period → he is quietly gone.
  2. **Player gets too close → JUMPSCARE:** a violent sting, the screen whips — **the player's rotation and tilt are randomized during the scare so his disappearance is never witnessed** — and when vision settles he is gone, the player is on **reserve breath at max heart rate.** No HP damage: he takes your air, your composure, and your sense of up.
  3. 7 shifts pass → he relocates (despawn + fresh spawn elsewhere).
- He is not killable, not shootable (shots pass through the dark where a body should be — never confirmed either way). He has no pathing, no AI: he is a placed dread object.
- Fiction hook (LORE §4): the site had lamp-men on the roster. One of them is on a MISSING notice that no crew book supports. Nothing in the game connects these facts out loud.

### 8.6 The Roster of 41 (NEW 2026-07-21, user idea — every Drowned is a PERSON; built at M14.5)
The "deliberately few variants" doctrine is superseded by something better: **there are exactly 41 Drowned, and each is an individual.** A crew book (internal data, never shown to the player) gives every man a name, a role, a bespoke procedural design (build, gear props, rig colors), a voice identity (per-man pitch/timbre over the moan set), base-stat multipliers, and optionally a behavior quirk (the workstation-pauser, the runner, the one who stands too long at the burrow mouth).
- **Never more than one of each man exists at a time.** The population IS the roster: spawning = a man coming on watch; despawning = going below. (The M14 population system's spawn tickets carry a crew id.)
- **The player is never told any of this.** They simply notice, run after run, that it is the same men — same face, same denim, same tool belt — which is the §1.1 wrongness made visceral. Lowe's "Barrow, was it" line stops being flavor and becomes observation.
- **Personal equipment drops (the user's idea, balanced the lore-safe way):** a crewman who carries equipment ALWAYS visibly carries it and ALWAYS drops it on recovery — consistency is absolute, because sometimes-has-it would break the fiction. **Balance lives in the watch bill instead: spawn weighting decides how often that man walks.** Scarcer batteries = the lamps-man comes on shift less often, never a lamps-man without his dry-cell. Drops stay SUPPLIES ONLY (dry-cells from the lamps-man, ammo from the stores-man, a rare slug from the reactor watch echoing T3) — progression items stay placed in the world, so the zero-kill win and the availability sims survive untouched.
- **The count stays wrong:** whether the Lamp Man (§8.5) is the forty-second is NEVER resolved — the roster data holds 41 names, the Lamp Man holds none, and no text ever counts them together (void #9 discipline; the user's "maybe the lamp man is the plus 1?" stays a maybe forever, which is exactly the game).

## 9. Shifts & the population (REWRITTEN 2026-07-21 — was kill-gated rounds)

The user's verdict on rounds: killing to advance felt like a chore, and waiting for spawns to bank points wasn't fun. Rounds are gone. **Shifts** replace them.

- **The shift clock is pure time.** A shift lasts `shiftSec` (v1 guess ~90 s, `tuning.ts`) and advances no matter what the player does. Shift change = one **shift bell** (the site's watch bell, positional from the winch head + always faintly audible) + the tally flicker. Kills change nothing about the clock.
- **Shift number scales the population, not a spawn budget:** mob cap = `capBase + capPerShift × shift` (v1: 4 + 1.5/shift, hard cap ~24 — perf note below). HP/speed curves keep their old round-curves, driven by shift number. There is no intermission, no round end, no Cave Stirs (deleted — nothing to hold open).
- **The cave is *populated*, not summoned:** spawning is map-wide at burrows across all zones — a UNIFORM pick over valid burrows (any distance bias funnels the cave through the nearest ones), with a floor just above aggro range so fresh bodies always start as wanderers and pressure arrives by drifting in. The population fills toward the cap continuously. **Pack spawns (implemented M14, safer than the original spec):** each spawn event is 1–5 Drowned emerging one-by-one from the same proven burrow point on a stagger timer — the separation solve strings them out. No invented placement math can ever put one inside rock, inside another body, or outside the map, which honors the paranoia requirement by construction.
- **Far from the player, the Drowned wander.** They drift through rooms and tunnels on the graph — avoiding squeezes, never re-entering burrows, never wandering into dead-end spurs the player is unlikely to visit (wander graph = playable graph minus squeeze edges, burrow nodes, and leaf dead-ends). Near the player they aggro and chase exactly as before — squeezes included.
- **Minecraft-style despawn/respawn keeps the cave full where it matters:** a Drowned that is far from the player and out of sight rolls a despawn chance every few seconds; despawned bodies return to the population budget and respawn elsewhere (again far + unseen). Nothing ever despawns near the player or in view. Net effect: wherever the player goes, the local cave is plausibly inhabited — the old failure ("swim fast and never see a zombie") is closed.
- **Spawn fairness rules keep §13 intact:** ≥12 m from the player, out of sight when avoidable.
- **Perf note:** the cap rises above the old 9-alive budget, so distant bodies must be cheap: no separation solve, reduced tick rate, simplified rig animation beyond ~40 m. Budget check in the milestone DoD.
- Specials per §8. The Ascent (§11) is unchanged: its own global fast-spawn clock supersedes shifts.

## 10. The site issues; it does not sell (REWRITTEN 2026-07-21 — points-economy deleted)

The user's verdict after real play: killing zombies to bank points made combat a chore and idling for spawns wasn't fun. **Nothing in the cave costs points anymore.** Progression is *found*, not bought — the gate on power is depth, the gate on gear is exploration, the gate on the Abyss is time itself.

**Points survive as pure vanity:** the ledger. 10/hit, 60/kill, 100/headshot, 130/melee still tick up — that is Lowe's compulsive tally (HUD top-right, reframed as the ledger count), it feeds the stats screens, and it buys nothing. Old costs quoted elsewhere in this document (zone table, traceability) are legacy flavor — nothing reads them.

### 10.1 Weapon racks & supply shelves (was wall buys; fixed locations in data)
The lockers stay exactly where they are and become what they always looked like: **stocked emergency equipment lockers.** Swim up, take the weapon (E). Free. The five wall guns (Speargun, Pneu-Driver, Flechette Scatter, Harpoon Rifle, Line Lance) keep their locations and their mechanical identities.
- **Ammo, batteries, chemlights, reels:** the vendor shelves issue them free with a **one-issue-per-bell cooldown** per shelf (the stencil "ONE PULL PER MAN PER BELL" is now the literal rule of the whole site). The cooldown is the pacing device that used to be price.
- Starting loadout unchanged: Wrist Dart, Dive Knife, 1 reel.

### 10.2 Requisition Roulette — free, one pull per man per bell
- The box keeps its locations (A Galleries, B Maze, C Abyss), its tease-and-move, and its pool (Twinfish, Arc Projector, Vortex Maw, Sonic Lance, Bang Stick + wall guns). The spin is **free** with a **once-per-shift-bell** cooldown. The gamble was always time and air; now that's the whole price.

### 10.3 Doors — found materials, never re-close
Doors stay territorial gates, but each kind now has its own key found in the world (empty dead ends and caches finally pay):
| Door kind | Opens with | Where the opener is found |
|---|---|---|
| **Debris chokes** (3: Sinkhole→Galleries, Galleries→Maze, Maze→Throat rim) | **Dynamite** — one charge per choke | Blasting crates cached in the cave (≥4 placed so one can be missed); stencil `BLASTING — CORMORANT` |
| **Grates** (2 shortcuts) | **A specific brass key** per grate | Key hooks in the site's rooms (stores board, infirmary); tag reads which grate |
| **The Abyss pressure hatch** (Throat bottom) | **Free to crank — but the site charges time: +5 shifts.** As the wheel turns, **five shift bells ring out one after another** and the shift counter rolls up five. The deepest door is paid for in the only currency the site respects. | — |
- Free alternates per the two-route rule are untouched: every progression door still has its nasty free bypass, so a missed charge is never a softlock.
- Opening stays hold-E + grind + silt puff; open is forever.

### 10.4 Power
- One switch, the **Pile room**, far end of the Galleries ring. On: dispensary racks light up, cherenkov string lights trace the arteries, the Bench warms. Turning on power is the first real dive: the moment the game starts. (Unchanged — power was never for sale.)

### 10.5 Draughts — pick 4 of 9, found in the racks, power required
The dispensary racks each hold **one filled flask** of their draught. Power live → take it and drink it (E). Free. The 4-of-9 cap is untouched and is still the identity system (tank/ghost/gun builds). Effects unchanged:
| Draught | Effect |
|---|---|
| Barnacle Hide | HP 100 → 220 |
| Second Wind | On death: blackout, wake at last-used air pocket with sidearm, flask consumed. Non-stackable. The rack refills after use — swim back for another. |
| Greased Gears | Reload ×0.5 |
| Trigger Fish | Fire rate +30% |
| Deep Pockets | 3rd weapon slot |
| Iron Lungs | Air 100 → 150, drain ×0.85 |
| Cat Eyes | +40% visibility in silt/dark, wider beam, less backscatter |
| Fin Kick | Swim +15%, sprint air cost ×0.8 |
| Steady Hands | Movement never stirs silt; tilt decays 3× faster |

### 10.6 The Bench (Pack-a-Punch) — power + a fuel slug per upgrade
- The Bench works when the Pile is live **and you feed it a fuel slug** — stenciled `CORMORANT — OUTPUT SLUG`, found in the world (3 placed: the Pile room, a Maze cache, the drill head; the Angler also drops one rarely). One slug per upgrade — a PaP run is a routing decision, not a savings goal.
- Upgrade effects unchanged: ×2.5 damage, bigger mag, rename, per-gun quirk, **PaP projectiles emit light.** PaP ammo: free at the lockers on the same one-per-bell cooldown.

### 10.7 Drops (from kills, ~2% + pity timer)
Max Ammo · **Double Ledger** (60 s — vanity, and proud of it) · Insta-Kill (30 s) · **Clear Waters** · **Battery Surge** · **Pressure Wave**. Drops are combat's remaining material reward: killing pays in supplies and safety, never in progression.

## 11. The Heart & endgame

- The **Heart of the Cave** sits in the Cathedral apse: a slow-pulsing biolum mass (what the site was drilling toward). Grabbing it is allowed any time you can physically reach it — the Guardians and the swim are the gate, not a flag check.
- Grabbing it starts the **Ascent**: continuous fast spawning everywhere, all zombies at the speed cap, global light stir (visibility down one grade), Guardians pursue beyond the Abyss. The Heart glows in your hands — you can see, and everything can see you. Weapons still usable (Heart stows on fire, glow persists).
- Reach the surface platform → **WIN.** No hard timer: air pockets still work, the swarm just never stops. Air and routing are the real timer. A pre-laid guide line up the Throat is the intended "I planned for this" payoff.
- Death during the Ascent = death (Second Wind still works; the Heart drops where you died, must be re-grabbed).

### 11.1 The Undertow (NEW 2026-07-21, user idea — the cave inhales; builds at M15.5)
The moment the Heart is lifted, a second mechanic arms alongside the Ascent: **every so often the ambient current is OVERRIDDEN by a far stronger one that pulls the player back toward the apse the Heart came from — wherever they are, the cave is sucking them back down.**
- **The route home is computed, not faked:** a one-time Dijkstra flow field from the Heart's chamber over the passage graph (door state respected) gives every point in the cave a next-hop direction toward the apse; during a surge the override current flows ALONG the passages down that field — honest physical water that pulls you through real tunnels, never at rock.
- **Cadence & feel (all knobs in `tuning.ts`):** a surge every ~60–90 s, ~8 s long, ramping in and out; strength far above ambient current (a real fight, not an instant loss), damped in squeezes per the existing pin-guard so it can never wedge you. Fighting it costs heart rate — the true price is air.
- **The event is theatrical:** a LOUD cue — an enormous distant machine spinning up (the amb-machinery pump is its voice; the whole soundscape should read as one vast intake) — a first-time voice line, and **the entire cave lights up for the duration**: string-light flare, biolum surge, a global cherenkov-tinted lift. The cave is alive, and it is a machine, and no text ever explains which.
- Honest-tells guard: bubbles and the gauge stay truthful through a surge; the pull is position-only, never camera.
- Lore (LORE addition with the milestone, drawn from the site-works/#1 voids per the spread rule — no count material): the site inhales; the wrongness is that the machine sound comes from everywhere, including the rock.

## 12. HUD / UX

Minimal, diegetic-leaning: O2 bar + number (bottom-left), ammo + battery pips (bottom-right), **the ledger** (top-right, +delta ticks — vanity tally, 2026-07-21), shift tally (top-left), small depth gauge + trend arrow (bottom-center). Grab = regulator-rip flash + bubbles. Damage vignette. Hitmarkers subtle. Screenshot mode (debug) hides HUD.

Run intro: **the job sheet** (LORE.md §2.3) as a skippable styled text card — it is how the player learns the objective (bottom of the bore, carry the Heart to daylight) plus two tutorial seeds, delivered in-world as a clinical recovery contract with one impossible detail. Posters/blueprint/photos support **inspect** (look + E → fullscreen overlay; while an inspect is open, E always closes it regardless of where you've drifted; LORE.md §7 readability rules). Tapes: **play immediately on pickup at any depth** (user revision 2026-07-20 — the safe-surfacing rule was reversed; LORE §5), subtitled, skippable, replayable from pause. Lowe speaks only after ~3 s continuously out of the water (LORE §2.1).

Menus: title (Dive / How to Dive / Settings), pause (incl. recovered-tapes list), death screen with stats, win screen with stats. **Stats screens are written as Lowe's ledger** (LORE.md §2): e.g. `RECOVERED: 214 / ROSTER: 41 / DISCREPANCY: noted` — kills, tapes, toys, shifts, time framed as recovery paperwork; the win screen ends on the forty-two beat (LORE.md §2.2 final lines). Settings: mouse sensitivity, invert Y, FOV, **max-tilt slider**, brightness, master/music/SFX/VO volume, subtitles (radio logs).

"How to Dive" teaches in ≤10 lines: air, line, chemlights, bubbles rise, mounds detonate, lights attract.

### 12.1 The Museum Annex & the Concept Gallery (NEW 2026-07-21 — celebration systems)

Both exist to *celebrate the story*, have **zero gameplay impact**, and will eventually be unlockables. **v1 ships them unlocked by default** (the gate designs below are written down now so a later session flips one switch):

- **The Museum Annex** — a new room connected to the **rec room** (gal-rec), dry air, a real safe zone (zombies never enter — the room is off the pathing graph entirely, like a teaser, but fully playable). It must be **by far the best-looking, best-lit room in the game**: polished poured floor, museum spot-lighting, brass rail, display pedestals under glass. It is a museum of the run's collectables: the six tapes on a shelf, the three tin divers, the nine draught flasks, every weapon on a rack, the photograph wall (every print/poster the player has inspected), figures of the Drowned / Angler / Lamp Man / Guardians on plinths with little plaques, and a roped-off replica of the Heart. Exhibits reflect what the player has actually gathered this run — walking in late-game should feel like walking through your own story. *(Future gate: opens after the player's first win. v1: open.)*
- **The morale button** — a guarded big red button in the Annex labeled `MORALE NIGHT`. Pressing it starts the **zombie party**: the exhibit figures dance, a mirror ball drops, the lighting goes saturated, and a dedicated party track plays (its own generated song — see §14). Press again to stop, sheepishly. Pure silliness by design; the user asked for it by name.
- **The Concept Gallery** — a `CONCEPT ART` section beside PHOTOGRAPHS in the pause/title menus: a browsable set of ~12 Gemini-generated concept paintings (the camp, the Drowned, the Angler, the Lamp Man, the Guardians, the Heart chamber, the Maze, the bore, the Dry Reach, Lowe, the REMORA case, alternate key art) in a painterly style distinct from the in-world print ephemera. Until generation runs (Gemini billing pending), each slot shows an on-theme `FILM UNDEVELOPED` frame. *(Future gate: pieces unlock as their subjects are encountered. v1: all visible.)*

## 13. Difficulty & fairness rules

- Zombies never spawn within 12 m or in the player's line of sight when avoidable.
- Every impairment has a counter the player can hold: silt→line/chemlights/Cat Eyes, dark→battery discipline/string lights, tilt→bubbles/gauge/X, air→pockets/Iron Lungs/routing.
- The game never moves the player's chemlights or line, never randomizes layout mid-run. The cave is fixed per run (single authored layout v1; procedural variation is out of scope).
- Sound is honest: zombie moans are distance/occlusion-attenuated truthfully; no fake far moans.

## 14. Audio (ElevenLabs + WebAudio)

- **Global underwater DSP:** low-pass + light convolver on everything below surface; lifts when head breaks water — the transition *is* the surface-relief feeling.
- **Depth ambience (user 2026-07-20):** three looping beds crossfaded on the SAME depth bands as the ambient current (§6.1) — where the current strengthens, the water *sounds* like it: pressure rising literally and mentally.
- **Audio-emitter nodes (user 2026-07-20):** map nodes (schema §16) that loop a positional sound from inside solid rock — machinery, heavy airflow, the site settling — muffled honestly by the SDF occlusion filter. The abandoned site is audibly still doing something, out of sight. Authored in the level editor (+♪, range/falloff shells shown).
- **Breathing loop** tied to air level (calm → ragged), heartbeat under 25 air; regulator hiss per exhale (synced to the visible bubble stream = the up-tell has a sound).
- Zombie moans (wet, muffled), Angler lure hum (faint wrong-feeling chord), Guardian sub-bass presence, silt-out "whump" + tinnitus dip, perk jingles (short, dark-goofy originals), **the shift bell** (2026-07-21: shift changes ring the site's watch bell — replaces the round-horn as the primary transition sound; the Abyss hatch rings it five times in sequence), PaP choir-groan, box music-box tease, faint geiger crackle near the Pile room (pure flavor — there is no radiation mechanic, and nothing may imply damage).
- **Radio logs:** 6 waterproof tape players in data-tagged spots; scripts are final in LORE.md §5 (Site BLACKWATER crew, 1968, increasingly wrong). ElevenLabs VO. Subtitled. Skippable. Play immediately on pickup at any depth (user 2026-07-20). Pure flavor, zero mechanics.
- **Player VO — Lowe — IN HIS HEAD (REVERSED 2026-07-21; supersedes the surface-only doctrine):** Lowe's lines now play *anywhere, including mid-swim*. The fiction holds because the delivery changes: these were never spoken aloud — they are **his inner voice** (he still never opens his mouth underwater; LORE §2.1 rewrite). DSP sells it: dry, close, intimate — no room, no water filter, no positional anything; gentle low-pass warmth + light compression + a whisper-quiet doubled layer, clearly *inside* the skull while the world stays wet around it. Anti-spam rules unchanged (silence is still the default).
- **REMORA — robotic, and also in his head:** her chain gains a synthetic treatment (telephone band-pass ~300–3400 Hz + subtle ring-mod/bitcrush + perfectly flat pacing) and the same no-room intimacy as Lowe. Design intent, per the user: **the player should genuinely wonder whether she is a real instrument or something Lowe imagines.** Nothing ever answers it (LORE void).
- **ONE SONG, ONE VOICE (new arbitration systems, 2026-07-21 — user heard the lull and the jukebox collide):**
  - **MusicDirector:** every music source (jukebox, lull, menu theme, Moonlight trigger, party track, win screen) requests a single music slot with priority; starting one stops the others. The **lull is demoted to true ambience: it may only start after a quiet period with NO music and NO dialog** (tapes, Lowe, REMORA) — it is what silence grows when left alone.
  - **VoiceDirector:** one global speech slot across Lowe, REMORA, and the tapes — two lines can never overlap; a playing tape blocks VO; queued lines wait their turn (priority: tapes > warnings > events > ambient) or expire.
- **"Moonlight at the Waterline" — the ascent song (user 2026-07-21):** during the Ascent, when the player carrying the Heart rises **shallower than 50 m** and no song is playing, Moonlight at the Waterline starts on the music bus. **Surfacing with the Heart while it plays ends the game INTO the song:** the win screen holds, every game sound (zombies, spawns, ambience) stops, and the track keeps playing to the end — bright and clear, as if in open air. The menu theme waits until the song finishes. The run's last minutes are scored, and the ending is the coda.
- **Easter egg — "Still on Shift":** three wind-up toy divers hidden in dead ends (data tag `toy`); winding all three wakes the rec-room jukebox. **The woken jukebox ALWAYS plays "Still on Shift" first** (user 2026-07-21) — the rest of `public/music/easteregg/` shuffles behind it for E-cycling. The user can drop tracks into the folder anytime, zero code.
- **The party track:** its own generated song for the Museum Annex morale button (§12.1) — up-tempo 1960s rock-and-roll dance number, period-correct and slightly wrong (working title "Morale Night"; lyrics spec in LORE §6.1). Plays only while the party runs, through the MusicDirector like everything else.
- Generation: ElevenLabs TTS for VO + sound-effects endpoint for moans/stingers where it shines; WebAudio synthesis fallback for anything it can't do. All audio generated once at Milestone 8 and committed as static files — runtime never calls external APIs.

## 15. Art direction

- Everything procedural (no modeling tools available): the cave mesh comes from a signed-distance field (union of tunnel capsules + chamber spheres from the graph, warped by 3D noise) extracted with marching cubes — watertight organic caves with overhangs, layered crossings, and irregular junctions for free. Triplanar-noise rock shader, instanced particles (silt, bubbles, motes), billboard god-rays only at the sinkhole shaft.
- **Murk is the art style.** Fog and darkness hide low fidelity; silhouettes carry: Drowned = ragged humanoid drift, Angler = a light with a suggestion of a body, Guardian = large slow occlusion of the biolum field, Heart = warm pulse in cold water.
- Palette by depth: sun-dappled teal (Sinkhole) → grey-green (Galleries) → near-black with pale chalk formations (Maze) → black with cyan biolum accents (Throat/Abyss). PaP/perk stations: small saturated color signatures — the only saturated things down there.
- Post: vignette, slight chromatic aberration scaling with tilt, subtle screen-space particulate always.
- **Flat diegetic media via Gemini:** posters, the site patch, perk labels, blueprint, crew photo, title art — full manifest with prompts in LORE.md §7; rendered as textured quads at data-tagged spots. Procedural canvas-text fallbacks so the game never blocks on generation quality. Everything else stays procedural.

## 16. Technical architecture & development rules

**Stack:** TypeScript (strict) + Three.js + Vite. No other runtime deps without a PLAN.md note. Tests: Vitest for pure logic (economy, air math, round scaling, graph connectivity); everything visual verified via the browser preview + debug harness.

**Map-as-data:** the layout lives in `src/cave/layout.json` (world units; the editor writes it, the loader `src/cave/data.ts` exports it — migrated 2026-07-19 when the level editor shipped at `?edit=1`). The schema:
```ts
type NodeId = string;
interface CaveNode { id: NodeId; pos: [number, number, number]; radius: number;
  stretch?: [number, number, number]; // rooms are ellipsoids, not spheres
  pillars?: number;                   // solid rock columns (path-clearance guaranteed)
  dry?: boolean;                      // air pocket with walkable dry floor + local water line
  teaser?: boolean;                   // visible-but-unreachable dressing (user 2026-07-20): carved, but outside every rule check, hidden by default in the editor
  kind?: 'room'|'audio';              // 'audio' = pure sound emitter (user 2026-07-20): NO geometry — usually buried in rock so the sound leaks through walls
  audio?: { sample: string; radiusM: number; falloff?: number }; // emitter: sample name, audible range, curve (refDist = radiusM/falloff)
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

*Schema growth queued by the 2026-07-21 redesign (implement with their milestones):* a `pickup` tag + `contents.pickup` (dynamite charge / grate key / fuel slug — doors gain a `needs` field naming their opener), a `museum` room flag (dry, lit, off the pathing graph but fully playable), and the Lamp Man's spawn set derives from edge data (normal-width Maze tunnels) rather than new authoring.

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
