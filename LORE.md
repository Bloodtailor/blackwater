# BLACKWATER — Lore & World Bible

> **How to use this document (note to future me):** DESIGN.md says *what the game is*, PLAN.md says *what to do next*, this file says *why the world looks and sounds the way it does*. Every visible asset, voice line, image, and name is dictated here — build nothing player-visible that this file doesn't explain. §1 is the internal truth: player-facing material (tapes, posters, VO) may only ever *imply* it. If a mechanic changes in DESIGN.md, update its in-world identity here in the same session.

## 1. The truth (internal — never stated outright in game)

- **1962.** A naval hydrological survey of a remote karst sinkhole logs a thermal anomaly: warm water rising from dry rock, 70 m down. Filed as instrument error, then quietly unfiled.
- **1964.** **Site BLACKWATER** is built *into* the cenote under cover of a water-table study: a dry-caisson installation threaded through the natural cave, berthing and admin in the shallows, workshops below, and a small experimental reactor — the crew calls it **the Pile** — to power the works. **Project CORMORANT** begins boring a vertical shaft toward the anomaly, designated **THERMAL-1**. The crew, 41 men, call it **the Heart**, because on quiet shifts they can hear it through the rock.
- **1968.** The closer the drill gets, the more the Pile surges in sympathy with it. The crew stops sleeping well; the infirmary doubles the "performance draught" doses; nobody rotates out on schedule anymore, and nobody asks to. On 14 June 1968, at 200 feet of bore depth, the aquifer breaches during a drill run. The site floods in eleven minutes. Nobody surfaces. The file is closed as a *training accident* — 41 names, one line each.
- **Now.** The Heart is warm, patient, and doesn't understand that a shift can end. It kept the crew. They are still working: walking the galleries, tending the dark, waiting for the drill to finish what it started. The Pile still holds a banked ember (why the power can come back on). Removing the Heart from the rock ends the arrangement — which is why taking it wakes everything at once (the Ascent), and why surfacing with it wins: the shift is finally over.
- **2008.** Elias Voss arrives with a truck, a rig, and his father's coordinates.

**Tone rules:** imply, never explain. No date on the Heart, no name for what it is. Tapes are procedural men noticing wrong things in procedural language. The scariest sentence available is a supply clerk saying something is "acting funny." Organizations stay generic ("the Navy," "the program") — no real units, no real people.

## 2. The player — Elias "Dutch" Voss

43. Ex–Navy saturation diver, now a salvage contractor out of Corpus Christi. Divorced, one storage unit, one good rig. His father, **Chief Marcus Voss**, was Site BLACKWATER's dive supervisor — *lost in a training accident, 1968*, when Elias was three. In 2007 a declassification sweep misfiles one page of the BLACKWATER supply ledger into a public archive; a dying man who spent 1968 topside — the one crewman who didn't dive that day — mails Dutch the rest: coordinates, a site plan, and an apology.

**Motivation, in order:** bring his father's tags home; understand what the Navy buried; and — once the tapes teach him what's keeping the crew down there — *end the shift*. He is not a soldier on a mission; he is a professional diver doing the most dangerous salvage of his life, alone, angry, and methodical.

**Voice:** low, dry, gravel; understatement as armor; talks to himself topside because "narrating keeps the dark honest" — an old sat-diver habit. Never panics on mic; the closest he gets is going quiet.

### 2.1 VO rules
- **Dutch NEVER speaks underwater.** Regulator in, mouth shut — his silence below is the horror discipline, and it makes every surface line land. Below, he is breath, heartbeat, and bubbles only.
- Lines trigger at: the platform, any air pocket (head above water), and menus. Tape reactions queue until he next surfaces.
- **Anti-spam (silence is the default):** the player visits air constantly — Dutch must not narrate every breath. Global ambient-line cooldown ≥ 120 s; each line plays at most once per run (no-repeat memory); priority queue = tape reactions > event reactions (power, close call, toys) > ambient, and ambient lines roll a ~40% chance even when off cooldown. If in doubt, he says nothing.
- Delivery: ElevenLabs at M8, one consistent voice, close-mic, slight room echo topside / tight wet echo in pockets.

### 2.2 Voice lines v1 (trim/extend at M8; categories are load-bearing, exact lines aren't)
**Surfacing (rotate):** "Air. Cheap when you're not buying it with your spine." · "Still daylight up here — feels like a rumor." · "Log it: passage north's a liar." · "Okay. Lungs first, opinions later." · "That's one more trip the cave didn't keep."
**Air pockets:** "Somebody else breathed this pocket once. Waste not." · "Quiet room, four inches of sky. Rent's fair." · "You can hear the site settle from here. Or something can." · "In through the nose... don't tell me my job."
**Close call (surfacing under 15 air):** "…That was arithmetic. I hate arithmetic." · "New rule. We leave earlier." · "The cave counted my air better than I did."
**Round change (heard from surface/pocket):** "Shift change." · "There's the whistle. Everybody up." · "Roster's moving again."
**Cave Stirs countdown audible:** "They're not waiting on stragglers anymore. Neither should I."
**Buying (topside wall buys):** "Navy surplus, sixty-year lease." · "Receipt's on the ledger with the other ghosts."
**Power restored (next surfacing):** "Lights on down there. Blue like a bruise. Pile's… awake. Good news, probably."
**Tape reactions (next surfacing, one per tape; escalating):** T1 "Supply clerk with good handwriting. Regular people down there. That's the part nobody says." · T4 "Doubling the draughts because the crew *dreamed wrong*. And they wrote it down like weather." · T5 "That's him. That's my old man asking permission to be careful. Denied. — Okay. Okay." · T6 *(long pause)* "…Water's warm. Yeah, Pop. I'm coming down anyway."
**Easter egg toys (per wind):** "A toy diver. Somebody's kid is seventy now." · "Two of them. Machinist made three — it's always three." · "Third one. All right, boys. Let's hear the rec room."
**Jukebox on:** "Forty years since anybody danced down here. About time."
**Second Wind wake:** "—Up. Up. Not like this. Not where he is."
**Idle (platform, rare):** "Truck's a hundred feet up. Feels like a different country." · "Nobody knows I'm here. That was smarter yesterday."
**Win (Ascent complete, final lines):** "Shift's over. All of you — go home." · *(quiet)* "Got your tags, Chief. Let's get some sun."

### 2.3 The letter (run intro — this is how the player learns the objective)
Shown as a skippable styled text card at run start (plain UI over black, typewriter + handwriting; no image dependency). It delivers the win condition, the stakes, and two tutorial seeds (lay your own line; don't trust the old ones) in-world, in under 30 seconds:

> *Voss — Your father's site is real. Coordinates on the back. I ran the winch topside on the day, which is why I'm alive to write this and why I never slept right after. Listen once: the thing they were drilling for is still down there, at the bottom of the bore, and it's why none of them ever came up — and why they're not done coming up. If you go — you're his son, so you'll go — cut it out of that rock and carry it to daylight. It's the only way any of them clock out. Don't trust the old lines down there. Lay your own.*
> *— C. Boone, winch operator, BLACKWATER '64–'68*

## 3. The setting — a facility fused through a cave

The user asked: cave, or flooded nuclear facility? **Answer: both, deliberately.** The *cave* is the connective tissue (organic passages — silt, squeezes, disorientation — and what procedural SDF geometry renders convincingly). The *facility* is threaded through it as man-made intrusions that grow denser with depth, because the site was built top-down along the dig. Intrusions are landmarks: isolated, readable, memorable — exactly what navigation-as-a-skill needs, and exactly what murk renders forgivingly. (A pure corridor-facility would demand clean architectural asset quality everywhere — the Venice Beach failure mode — and would cost us the cave-diving horror the whole game is built on.)

**Intrusion gradient by zone:**
| Zone | Natural | Site intrusion |
|---|---|---|
| Sinkhole | daylight shaft, pool | Dutch's 2008 camp (truck winch, tarp, gear crates) + the 1968 winch head and dive platform, rotted stencils |
| Galleries | ring cave, first darkness | **Berthing & admin**: bunk alcoves, the **rec room** (jukebox), mess, notice boards (posters), and the **Pile room** — the power switch, cherenkov-blue glow when live |
| Maze | the confusing heart of the cave | **Stores & infirmary**: requisition crates (mystery box), draught dispensary racks (perk stations), specimen labs, cable runs that dive in and out of raw rock |
| Throat | — | **The bore itself.** The straight-down shaft IS the drill hole, lined with scaffold rings and guide chains. Of course it's vertical: they dug it that way. |
| Abyss | the Cathedral (natural void the drill broke into) | **Drill head & the Bench** (forward machine shop = Pack-a-Punch), floodlamp stands, and the Heart in the apse where the last bit fell |

**Materials language:** 1960s navy — riveted steel, brass, hemp line, canvas, stenciled paint (white/yellow), chalk tallies, waxed paper. Everything rusted, everything soft with silt. 2008 intrudes only at the surface camp (nylon, plastic, LED) so Dutch's gear reads as *from another world*.

## 4. Visual language glossary (what the player sees → what it is → appearance directive)

| Game object | In-world identity | Appearance |
|---|---|---|
| Wall buys | Emergency equipment lockers, stenciled with contents + price in chalk (crew's requisition tally system) | Open steel lockers, painted outline of the weapon, dangling chalk slate |
| Mystery box | **Requisition Roulette** — the crew's supply-lottery ritual; several crates exist, one is "live" | Slatted crate on a cart, hazard stripes, warm light through slats; when it relocates, a **wind-up toy diver** sits in the empty crate (homage + motif) |
| Perk stations | **Draught dispensary** racks — NHP-series "performance draughts," crew-slang names chalked over official plates | Brass-and-glass canister vendors; per-perk color cap + stencil icon (Gemini label sheet G9); short jingles at M8 |
| Pack-a-Punch | **The Bench** — forward machine shop rig that bathes a weapon in the Pile's output | Lathe-altar with cabling back toward the Pile, cherenkov glow, tag stamped "PROPERTY CORMORANT" |
| Power switch | The Pile's control board — one theatrical breaker | Concrete pit, control rods, gauges pinned past red, blue shimmer when live |
| Doors — debris | Roof-fall the crew never cleared | Rock choke with a winch point |
| Doors — grate | Site security grates | Riveted lattice, padlock chain, stencil |
| Doors — hatch | Bulkhead pressure hatches | Crank-wheel navy hatch, gasket weeping rust |
| String lights | Site utility lighting off the Pile | Caged bulbs on cable, cherenkov-tinted, gentle sway |
| Chalk mounds | Natural silt-laden flowstone the crew flagged and feared | Pale bulbous stacks + faint shimmer; some wear 1968 warning tags ("DO NOT TOUCH — SILT") — the crew teaches the player |
| Air pockets | Natural domes; a few are site airlocks holding a bubble | Mirror-silver ceiling from below; airlock ones add gauges and a bench |
| Guide line / reels | Dutch's own kit (2008 nylon, white) vs. the crew's old hemp lines (brown, rotten, *don't trust them* — decor, not followable) | Clean white vs. fuzzed brown; the contrast is a silent tutorial (seeded by Boone's letter). 2–3 hemp lines lead somewhere (a body, a cache, a tape) so curiosity pays |
| Chemlights | Dutch's marker sticks | Green, cold, modern |
| Batteries | Site dry-cells in wax paper, still good ("the program overbuilt everything") | Wax-paper brick, stencil font |
| Tapes | Waterproof log recorders, crew personal effects | Olive-drab reel-to-reel bricks, red REC dot |
| The Heart | THERMAL-1 | A slow warm pulse inside translucent flowstone, organic-ambiguous; never fully lit, never explained |
| The Drowned | The 41 — deck crew still on shift | 1968 denim/canvas work gear, tool belts, drift-walk; faces ruined by water, not gore-shredded (they're sad before they're scary) |
| The Angler | Lamp-men who walked into the dark holding lanterns | A warm handheld lamp, wrong color temperature, body a suggestion behind it |
| The Silt Shade | The ones the silt took | Silhouette-only in murk, denser than the cloud around it |
| Abyss Guardians | **Castor & Pollux** — two Mark V atmospheric-suit divers, still on post at the drill head | Big brass hard-hat silhouettes, hose stubs, name stenciled on the bell; slow, inevitable |
| Posters | Program safety/propaganda print | See Gemini manifest §7 |
| Jukebox | Rec-room morale unit, 1966 | Chrome-and-walnut box, bubble arch, dead until the toys wake it |
| Toy divers ×3 | The machinist's wind-up gifts for his three sons — never delivered | Painted tin (red/blue/yellow), crank key, tiny helmet; faint music-box shimmer audible ≤8 m so a searching player finds them without pixel-hunting |

## 5. Tapes — full scripts (6; VO at M8; subtitled; 20–40 s each)

**Playback (important):** tapes do NOT play where they're found — nobody listens to a 30-second log while being hunted at depth, so depth-playback would just train players to skip story. Pickup is a one-second interaction (click + "TAPE RECOVERED — T3" toast); the tape **auto-plays the next time Dutch has his head above water and it's safe** (no enemy within ~20 m), followed by his queued reaction line; all recovered tapes are replayable from the pause menu. This makes the surface/pocket rhythm the story rhythm: dive = tension, breathe = story.

- **T1 — Sinkhole, camp locker. Quartermaster, 12 MAR 68.** "Supply log, March twelve. Forty-one souls, coffee for sixty, complaints for a hundred. New man asked why the pay's double. Told him: the commute. Pile's humming pretty, drill's ahead of schedule. Easiest hard duty in the Navy."
- **T2 — Galleries rec room. Morale officer.** "Rec room's done. Jukebox came down the shaft wrapped like a church bell. Machinist's been turning little wind-up divers on the lathe for his boys — three of them, red, blue, yellow. Says the youngest thinks his old man lives in the ocean. Kid's not wrong."
- **T3 — Pile room. Reactor engineer.** "Log. The Pile surges when the drill runs. Not load — the numbers are clean — it just… leans. Like it's listening down the bore. Chief says rock's rock. Fine. Then why do I keep my hand off the rail when the bit's turning?"
- **T4 — Maze infirmary. Site physician.** "Medical log. Crew reports identical dreams — a slow knock, deep, patient. I've doubled the draught ration and men are volunteering for extra shifts *below*. I wrote 'morale is high' in the weekly. God forgive me, it's true. That's what worries me."
- **T5 — Throat rim. Chief Marcus Voss.** "Dive supervisor's log. Bore's at two hundred feet. Water temp is up nine degrees and my gauges say that's impossible. I have formally requested we halt and survey. Request denied — schedule holds. Fine. But I'm writing it here: the deeper we cut, the more this feels less like drilling… and more like knocking."
- **T6 — Abyss, drill head. Marcus Voss, 14 JUN 68.** *(calm, water sounds rising)* "…Breach in the bore, flooding aft galleries, crew's making for the shaft. I'm staying to crank the hatch behind them. Somebody has to. If this reel ever surfaces — tell my boys their old man clocked out proper. And tell Elias… the water's warm down here. That part's true. It's warm."

## 6. Easter egg — the rec-room song

**Mechanic (BO1 teddy-bear homage):** the three wind-up toy divers are hidden in three *dead ends* (data-tagged `toy`; rewarded exploration). Interact to wind each (Dutch line per toy, §2.2). Winding all three wakes the rec-room **jukebox**: one song plays game-wide through the underwater DSP — muffled, far away, everywhere. Once per run.

**Music sourcing, in order:**
1. **ElevenLabs Eleven Music** (API): can generate full songs *with lyrics*. Attempt at M8 with the lyrics below. Quality gate: if it can't carry a rock vocal, don't ship it.
2. **`public/music/easteregg/` folder — built regardless:** the jukebox plays a *random MP3 from this folder*, so the user can drop in Suno tracks (or anything) with zero code. Ships with whatever M8 produces as track one.

**Song: "Still on Shift"** — the game's Elena-Siegman-style anthem, written from the crew's side, watching Dutch descend.

**Suno style prompt:** `Dark melodic hard rock, powerful haunting female lead vocal, aggressive driving verses, soaring mournful minor-key chorus, clean eerie hymn-like bridge with sonar pings and distant water ambience, heavy guitars, cinematic build, outro fades into a lone voice humming a 1960s navy hymn underwater. Mid-tempo, ~4 minutes.`

**Lyrics (full, paste-ready):**
```
[Verse 1]
Sixty-eight, the water came, nobody rang the bell
Forty men in the earth's black vein, digging their way to hell
The Pile sang her blue-glass hymn, the bit bled through the stone
And something warm in the cold below said: stay — you're almost home

[Pre-Chorus]
Punch your card at the gates of the dark
The foreman never sleeps
The roster's writ in rust and bone
And the water's ours to keep

[Chorus]
We're still on shift — down in the black
The daylight drowned in '68 and it's never coming back
Still on shift — the Heart won't let us go
She keeps the count, she keeps us proud
Forty fathoms down below

[Verse 2]
Letters home dissolved to silt, brass and bone and wire
The lamp-men walked into the dark, trading air for fire
Now a stranger's light comes down the line, a name we half recall —
The Chief's boy with his father's eyes, come to end it all

[Pre-Chorus]
Punch your card at the gates of the dark
Third bell of the drowning day
The draughts are poured, the crates are stacked
And the Heart has final say

[Chorus]
We're still on shift — down in the black
The daylight drowned in '68 and it's never coming back
Still on shift — the Heart won't let us go
She keeps the count, she keeps us proud
Forty fathoms down below

[Bridge — slow, hymnal]
Lay your line, boy — follow it home
Bubbles rise, and so do souls
Cut her out of the mountain's chest
Clock us out. Give the tired rest.

[Final Chorus — half-time, huge]
We're still on shift — but the whistle's blown
The Chief's boy carried the morning down and he isn't leaving alone
Off the shift — she's letting go
Forty fathoms up to the sun
From the dark below

[Outro — lone hummed navy hymn, underwater, fading]
```

## 7. Gemini image manifest (generate at M8; textured quads in-world; procedural canvas-text fallbacks so nothing blocks on quality)

Global style suffix for every prompt: *"1960s US Navy print ephemera, offset-print grain, aged and water-stained, muted period palette, worn edges, no modern typography, no watermarks."*

**Readability rules:** every poster is designed **bold-headline-first** (large type, high contrast, minimal body text) because it will be read by flashlight in murk — and every poster/blueprint/photo supports **inspect** (look + E → fullscreen overlay of the texture). In-world legibility sells atmosphere; the overlay carries the actual reading. Text in generated images is decorative; any text the player must *understand* is rendered as a real subtitle/caption in the overlay, so garbled AI lettering can never break comprehension.

| ID | Image | Used | Aspect |
|---|---|---|---|
| G1 | Site BLACKWATER patch: anglerfish curled around a trident, ring text "NAVSITE BLACKWATER — CORMORANT" | Menus, hatches, HUD corner | 1:1 |
| G2 | Title key art: sinkhole shaft of daylight into black water, tiny diver descending | Title screen | 16:9 |
| G3 | Poster "YOUR LINE IS YOUR LIFE — LAY IT. TRUST IT." diver + guide line diagram | Galleries/Maze walls | 2:3 |
| G4 | Poster "SLOW IS SMOOTH — SILT KILLS" fin technique diagram | near silty chambers | 2:3 |
| G5 | Poster "THE PILE PROVIDES — RESPECT HER" reactor pictogram, blue accent | Pile room | 2:3 |
| G6 | Poster "DRAUGHT RATION IS NOT OPTIONAL" cheerful sailor + canister | dispensaries | 2:3 |
| G7 | Poster "REQUISITION ROULETTE — ONE PULL PER MAN PER BELL" crate + dice | box spots | 2:3 |
| G8 | Notice "MISSING: E. HALVERSEN, LAMP-MAN — LAST SEEN BELOW" small photo, curling | Maze, late-game dread | 3:4 |
| G9 | Perk canister labels ×9 — generated **individually** (one prompt per perk from DESIGN §10.5: name, icon motif, color cap), not as a sheet to slice | perk stations | 1:1 ×9 |
| G10 | Site schematic blueprint, pre-flood: **accurate for the built facility portions, hand-sketched and openly uncertain for natural cave** (dotted lines, "?", grease-pencil crew annotations like "COLLAPSED", "DO NOT USE") — honest about what it doesn't know, so players can trust it exactly as far as the crew did; the confusing natural passages stay unmapped | spawn platform + menu | 3:2 |
| G11 | Crew photo: a large group of men in dive/work gear on the platform, 1966, one face circled in grease pencil (Marcus) — prompt says "a few dozen", never an exact count (generators can't count and nobody will) | camp + ending | 3:2 |
| G12 | Jukebox faceplate + "REC ROOM — 1900–2100 — BE A GENTLEMAN" sign | rec room | 1:1, 3:1 |

## 8. Naming & stencil glossary
**BLACKWATER** (site) · **CORMORANT** (the dig) · **THERMAL-1 / "the Heart"** · **the Pile** (reactor) · **the Bench** (PaP) · **Draughts** (perks) · **Requisition Roulette** (box) · **Castor & Pollux** (Guardians) · **the 41** (the crew) · bells, not hours ("third bell") · Dutch's rig is 2008-mundane: no callsigns, no acronyms — he's a civilian in a government ghost story.
