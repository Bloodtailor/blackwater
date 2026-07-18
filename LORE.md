# BLACKWATER — Lore & World Bible (v2 — mystery-first)

> **How to use this document (note to future me):** DESIGN.md says *what the game is*, PLAN.md says *what to do next*, this file says *why the world looks and sounds the way it does*. Build nothing player-visible that this file doesn't cover. **v2 note:** this file deliberately does not contain answers. §1.2 lists the voids — questions this game raises and will never resolve, *not even internally*. Do not invent answers for them in any session, any asset, any line. You cannot leak what does not exist.

## 1. What is known, and what is not

### 1.1 Established (functional facts the game is built on)
- 1962: a naval hydrological survey logs warm water rising through dry rock in a remote karst sinkhole. The finding is unfiled, then the site is acquired.
- 1964–1968: **Site BLACKWATER** operates inside the cenote — berthing shallow, workshops mid, a small experimental reactor ("**the Pile**") deep, and a bore (**the Throat**) drilled straight down toward the warmth, designated **THERMAL-1**. Crew of record: **41**.
- 14 JUN 1968: the aquifer breaches during a drill run. The site floods in minutes. No recoveries are ever made. Records are sealed. The paper trail simply stops.
- Now (2008): the flooded site is intact. The Pile can be restarted. THERMAL-1 — the crew's chalk on the bore rim calls it **the Heart** — is at the bottom, warm, and can be carried. Removing it from the rock wakes everything at once (the Ascent). Carrying it into daylight ends the game: a **recovery, complete**.
- The Drowned are the crew. This is visible (their gear, their stations) and is never explained.

### 1.2 The voids — raised, braided through the game, never answered
1. **What the Heart is.** Warm. That is the entire file.
2. **Why the crew still moves.** No tape, no line, no poster explains it.
3. **The count.** The roster says 41. Evidence keeps producing **42** — an extra voice, an extra face, "one over" in a headcount. Nothing ever identifies the extra. *(This is the spine-void; see the braid, §1.3.)*
4. **The client.** Who is paying Lowe, why the fee is absurd, how they know what they know, why him by name.
5. **The 1971 photograph.** The job sheet encloses an interior photo of the Heart chamber with a processing stamp three years *after* the flood. No one has ever been down since. Never addressed again.
6. **What the site was *for*.** Who ordered a reactor and a bore in a sinkhole, toward what end — the mission paragraph of every document is redacted or missing.
7. **Why measurements disagree down there.** Depths, counts, dates — instruments and ledgers produce two true answers. The cave is not lying; the records are not lying; they still disagree.
8. **The empty suits.** Two condemned Mark V atmospheric suits stand post at the drill head. The 1966 equipment log lists both: *RETURNED — EMPTY.* The names on the bells are scraped off.

### 1.3 Rules of the mystery (the horror engine)
- **Mundane voice, one wrongness per artifact.** Every tape, poster, and stencil is boring official paper with exactly one detail that cannot be true. Never two — two wrongnesses is a ghost story; one is a filing error that follows you home.
- **Evidence disagrees.** If two artifacts corroborate each other cleanly, one of them must be changed. (A MISSING notice for a man the roster never contained, in a site whose headcount ran *over*.)
- **The flood is never depicted.** No tape narrates it, no one says goodbye. The record ends on June 13th business-as-usual, and then there is only water. The disaster is a hole in the paperwork.
- **No one in 1968 understood either.** The crew's documents are as confused as the player. There is no hidden log where somebody figured it out.
- **The voids stay closed forever** — post-ship content included.
- **Unreliability lives in the fiction only.** Gameplay tells stay honest per DESIGN pillar 3: bubbles rise, the depth gauge is correct, chemlights stay where placed. The *documents* doubt the world; the *game* never gaslights the player.

## 2. The player — Vernon Lowe

Lowe, ~55, is a **recovery diver**: the man families hire to bring drowned people out of caves and quarries when the official search ends. Three hundred–odd recoveries over thirty years. He is the best there is at the worst job there is, for a reason he doesn't advertise: **he has never once been afraid underwater.** He knows a man should flinch somewhere. He is quietly troubled that he doesn't.

He is soft-spoken, formal, courteous. Not military — never was. Topside life didn't collapse tragically; it just never took. Rooms feel like waiting rooms to him. Underwater, everything is exactly where he left it.

**Two habits define him (and his VO):**
- **He talks to the dead.** A courtesy of his trade — you tell the recovered what you're doing; it keeps your hands steady. In this game that habit turns strange: he addresses the 41 like clients on a schedule. *"I'll be along. I do this in order."*
- **He counts.** Everything, always. Counting is how he stays calm. BLACKWATER is the place where counting stops working — which makes him the precisely wrong man, or the precisely right one, and the game never says which.

**Motivation (in order, none sentimental):**
1. **The fee.** $1,400,000 on completion. It ends his career. He wants out of the water before, as he puts it, *the water notices him.*
2. **The ledger.** Forty-one unrecovered is the largest unfinished job in the history of his trade. This is not grief — he never met these men. It is *completion*, the professional compulsion of a man who has spent thirty years finishing other people's searches.
3. **A third reason the document declines to state.** The client asked for him *by name.* (Void #4. He noticed. He came anyway.)

**Fear register (VO direction):** Lowe does not swear, gasp, or shake. When something reaches him, he becomes *more* polite. His worst moment in the game ends with the word "please." That is the only tell he has.

### 2.1 VO rules
- **Lowe NEVER speaks underwater.** Regulator in, mouth shut — his silence below is the horror discipline, and it makes every surface line land. Below, he is breath, heartbeat, and bubbles only.
- Lines trigger at: the platform, any air pocket (head above water), and menus. Tape reactions queue until he next surfaces.
- **Anti-spam (silence is the default):** global ambient-line cooldown ≥ 120 s; each line plays at most once per run (no-repeat memory); priority queue = tape reactions > event reactions (power, close call, toys) > ambient, and ambient lines roll a ~40% chance even when off cooldown. If in doubt, he says nothing.
- Delivery: ElevenLabs at M8, one consistent voice — soft, unhurried, courteous, aging Midwestern; close-mic; slight room echo topside / tight wet echo in pockets.

### 2.2 Voice lines v1 (trim/extend at M8; categories are load-bearing, exact lines aren't)
**Surfacing (rotate):** "Air. Thank you kindly." · "Still daylight up there. It keeps surprising me. I keep letting it." · "Four of you today. It's in the book." · "That's one more trip the water let me keep."
**Air pockets (often addressed to the dead):** "Room in here for one. Present company excepted." · "I'll be along. I do this in order. I always have." · "Quiet room, four inches of sky. I've rented worse." · "You can hear the site settle from in here. Or it can hear us."
**Close call (surfacing under 15 air):** "Noted. Earlier next time. We always say that, don't we." · "That was arithmetic, not luck. I prefer arithmetic on my side."
**Round change (heard from surface/pocket):** "Shift bell. Not mine." · "The roster's moving. It moves more than a roster should."
**Cave Stirs countdown audible:** "They've stopped waiting on stragglers. I never waited on stragglers either."
**Power restored (next surfacing):** "Lights below. Blue as a bruise. It was more honest dark."
**Tape reactions (next surfacing, one per tape):**
- T1: "One over. Not under — *over.* I counted the crew photograph twice at camp. I got two different numbers. I won't be counting it again."
- T2: "Toys nobody ordered, signed for by a man who doesn't remember signing. Honest books about dishonest things."
- T3: "Machines don't fast. Either something fed the Pile, or the Pile was the meal. The engineer chose not to know. Professional of him."
- T4: "Forty-one wrists, one pulse. He checked his own. I have decided not to check mine."
- T5: "Two hundred by tally, three hundred by line. Both true. I've dived four hundred caves. The ones that lie about depth are the ones that keep you."
- T6: *(pause)* "That roster was read three weeks after the water came. The voice is not in the crew book. …I'd like to finish this job soon, please."
**Easter egg toys (per wind):** "A wind-up diver. Requisitioned by no one. I'll wind it anyway — it's rude not to." · "Two. There's always a set. Sets are always three." · "Three, all wound. Whatever listens to these: the floor is yours."
**Jukebox on:** "Music. Nineteen sixty-six. Nobody down here minds — and that's the trouble."
**Second Wind wake:** "—Clock's still running. Up. Politely now."
**Idle (platform, rare):** "The truck is a hundred feet up. I've begun to think of it as a rumor." · "Nobody knows I'm here. The client knows I'm here. I've decided those are different things."
**Win (Ascent complete, final lines of the game):** "Recovery complete. Forty-one." *(beat)* "…Forty-two." *(quiet, brisk)* "Out of the water, Lowe. Out of the water."

### 2.3 The job sheet (run intro — this is how the player learns the objective)
Skippable styled text card at run start: a clinical contract page with Lowe's own pencil note at the bottom. Delivers the win condition, two tutorial seeds, and voids #4 and #5 in under 30 seconds:

> **RECOVERY ORDER — PRIVATE CLIENT** *(through Merrin & Slade, attorneys)*
> Diver: V. Lowe, sole. Fee: $200,000 on attempt (cleared); $1,400,000 on completion.
> Item: THERMAL-1. Bottom of the bore, Site BLACKWATER (coordinates enclosed). Item is warm to the touch. Item is to be carried, not rigged, not bagged. Recover to open daylight.
> Conditions: Site lines are condemned — lay your own. Do not photograph the item. Do not correct the count.
> Enclosure: one (1) interior photograph of target chamber, print, processing stamp 1971.
>
> *(pencil, Lowe's hand:)* *Stamp is three years after the water. Asked. No answer. Fee cleared anyway. — V.L.*

## 3. The setting — a facility fused through a cave

The user asked: cave, or flooded nuclear facility? **Answer: both, deliberately.** The *cave* is the connective tissue (organic passages — silt, squeezes, disorientation — what procedural SDF geometry renders convincingly). The *facility* is threaded through it as man-made intrusions that grow denser with depth, because the site was built top-down along the dig. Intrusions are landmarks: isolated, readable, memorable — what navigation-as-a-skill needs, and what murk renders forgivingly. (A pure corridor-facility would demand clean architectural asset quality everywhere — the Venice Beach failure mode — and would cost us the cave-diving horror the whole game is built on.)

**Intrusion gradient by zone:**
| Zone | Natural | Site intrusion |
|---|---|---|
| Sinkhole | daylight shaft, pool | Lowe's 2008 camp (truck winch, tarp, gear crates) + the 1968 winch head and dive platform, rotted stencils |
| Galleries | ring cave, first darkness | **Berthing & admin**: bunk alcoves, the **rec room** (jukebox), mess, notice boards (posters), and the **Pile room** — the power switch, cherenkov-blue glow when live |
| Maze | the confusing heart of the cave | **Stores & infirmary**: requisition crates (mystery box), draught dispensary racks (perk stations), specimen labs, cable runs that dive in and out of raw rock |
| Throat | — | **The bore itself.** The straight-down shaft IS the drill hole, lined with scaffold rings and guide chains. Of course it's vertical: they dug it that way. |
| Abyss | the Cathedral (natural void the drill broke into) | **Drill head & the Bench** (forward machine shop = Pack-a-Punch), floodlamp stands, and the Heart in the apse where the last bit fell |

**Materials language:** 1960s navy — riveted steel, brass, hemp line, canvas, stenciled paint (white/yellow), chalk tallies, waxed paper. Everything rusted, everything soft with silt. 2008 intrudes only at the surface camp (nylon, plastic, LED) so Lowe's gear reads as *from another world*.

## 4. Visual language glossary (what the player sees → what it is → appearance directive)

| Game object | In-world identity | Appearance |
|---|---|---|
| Wall buys | Emergency equipment lockers, stenciled with contents + price in chalk (the crew's requisition tally system) | Open steel lockers, painted outline of the weapon, dangling chalk slate |
| Mystery box | **Requisition Roulette** — the crew's supply-lottery ritual; several crates exist, one is "live" | Slatted crate on a cart, hazard stripes, warm light through slats; when it relocates, a **wind-up toy diver** sits in the empty crate (motif; no one explains who moves the crate) |
| Perk stations | **Draught dispensary** racks — NHP-series "performance draughts," crew-slang names chalked over official plates | Brass-and-glass canister vendors; per-perk color cap + stencil icon (Gemini labels G9); short jingles at M8 |
| Pack-a-Punch | **The Bench** — forward machine-shop rig that bathes a weapon in the Pile's output | Lathe-altar with cabling back toward the Pile, cherenkov glow, tag stamped "PROPERTY CORMORANT" |
| Power switch | The Pile's control board — one theatrical breaker | Concrete pit, control rods, gauges pinned past red, blue shimmer when live |
| Doors — debris | Roof-fall the crew never cleared | Rock choke with a winch point |
| Doors — grate | Site security grates | Riveted lattice, padlock chain, stencil |
| Doors — hatch | Bulkhead pressure hatches | Crank-wheel navy hatch, gasket weeping rust |
| String lights | Site utility lighting off the Pile | Caged bulbs on cable, cherenkov-tinted, gentle sway |
| Chalk mounds | Natural silt-laden flowstone the crew flagged and feared | Pale bulbous stacks + faint shimmer; some wear 1968 warning tags ("DO NOT TOUCH — SILT") — the crew teaches the player |
| Air pockets | Natural domes; a few are site airlocks holding a bubble | Mirror-silver ceiling from below; airlock ones add gauges and a bench |
| Guide line / reels | Lowe's kit (2008 nylon, white) vs. the crew's hemp lines (brown, rotten, *condemned per the job sheet* — decor, not followable) | Clean white vs. fuzzed brown; the contrast is a silent tutorial. 2–3 hemp lines lead somewhere (a body at a workstation, a cache, a tape) so curiosity pays |
| Chemlights | Lowe's marker sticks | Green, cold, modern |
| Batteries | Site dry-cells in wax paper, still good | Wax-paper brick, stencil font |
| Tapes | Waterproof log recorders, crew personal effects | Olive-drab reel-to-reel bricks, red REC dot |
| The Heart | THERMAL-1. Warm. That is the entire file. | A slow warm pulse inside translucent flowstone, organic-ambiguous; never fully lit, never explained |
| The Drowned | The crew. No further identity is offered. | 1968 denim/canvas work gear, tool belts, drift-walk; faces ruined by water, not gore. **Directive:** they sometimes pause at their old workstations mid-pursuit, as if remembering a task (cheap idle behavior near facility props; deeply wrong) |
| The Angler | Carries a site-pattern lamp that appears in no equipment catalog. The roster's lamp-men were all accounted for. It is not addressed further. | A warm handheld lamp, wrong color temperature, body a suggestion behind it |
| The Silt Shade | The silt is not always empty. | Silhouette-only in murk, denser than the cloud around it |
| Abyss Guardians | Two Mark V atmospheric suits standing post at the drill head. Equipment log, 1966: *CONDEMNED — RETURNED EMPTY.* The names on the bells are scraped off. (Void #8; never resolved) | Big brass hard-hat silhouettes, hose stubs, scraped stencil scars on the bells; slow, inevitable |
| Posters | Program safety/propaganda print | See Gemini manifest §7 |
| Jukebox | Rec-room morale unit, 1966 | Chrome-and-walnut box, bubble arch, dead until the toys wake it |
| Toy divers ×3 | Wind-up tin divers. The requisition slip says the *site* ordered them; no one on the crew had children; the signature is a crewman's who didn't remember signing (T2). Nothing else is known. | Painted tin (red/blue/yellow), crank key, tiny helmet; faint music-box shimmer audible ≤8 m so a searching player finds them without pixel-hunting |

## 5. Tapes — full scripts (6; VO at M8; subtitled; 20–40 s each)

**Playback (important):** tapes do NOT play where they're found. Pickup is a one-second interaction (click + "TAPE RECOVERED — T3" toast); the tape **auto-plays the next time Lowe has his head above water and it's safe** (no enemy within ~20 m), followed by his queued reaction line; recovered tapes replay from the pause menu. Dive = tension, breathe = story.

Each tape is mundane official business with **exactly one wrongness**. No tape mentions the flood. Together they corroborate nothing.

- **T1 — Sinkhole, camp locker. Quartermaster, 12 MAR 68.** "Supply log, March twelve. Coffee's short again, requisitioned double. Mustered the full complement for the quarterly photograph, all present. Recount came up one man *over*. Not under — over. Ran it twice. I've logged forty-one and I am not running it again."
- **T2 — Galleries rec room. Morale officer.** "Rec room inventory. Jukebox: operational. Cards: complete. Item: three wind-up toy divers, tin, painted. Requisition slip says we ordered them — this office ordered them. Nobody here has kids. Slip's got my signature. I don't remember signing. Filing it under morale."
- **T3 — Pile room. Reactor engineer.** "Reactor log, weekly. Output nominal. Fuel consumption is down four percent, third month running. Output *nominal.* A pile that eats less and gives the same. I've stopped putting it in the weekly report, because I enjoy being believed."
- **T4 — Maze infirmary. Site physician.** "Medical log. Sleep study, week six. At depth, resting pulses synchronize across the watch. All of them. Forty-one men, one rhythm. Last night I timed it against my own wrist. I want that noted, and I want it noted that I'm sorry I checked."
- **T5 — Throat rim. Dive supervisor.** "Bore survey. Tally counter reads two hundred feet. The knotted line reads three hundred. I have re-measured nine times with both. Both readings are correct. I have requested better instruments, and I have been told the instruments are fine. The instruments are fine."
- **T6 — Abyss, drill head. Undated.** *(no water sounds; a flat, unhurried voice reading a duty roster, name after name; a processing note in the corner of the label reads 05 JUL 68 — three weeks after the flood)* "…Albrecht, forward watch. Ames, galley. Barrow, lamps. Bell, stores. Calloway, drill. Carver, drill. Deem—" *(ends mid-name. The voice does not appear in the crew book.)*

## 6. Easter egg — the rec-room song

**Mechanic (BO1 teddy-bear homage):** the three wind-up toy divers are hidden in three *dead ends* (data-tagged `toy`; rewarded exploration; audible shimmer ≤8 m). Interact to wind each (Lowe line per toy, §2.2). Winding all three wakes the rec-room **jukebox**: one song plays game-wide through the underwater DSP — muffled, far away, everywhere. Once per run.

**Music sourcing, in order:**
1. **ElevenLabs Eleven Music** (API): full songs with lyrics. Attempt at M8 with the lyrics below. Quality gate: if it can't carry a rock vocal, don't ship it.
2. **`public/music/easteregg/` folder — built regardless:** the jukebox plays a *random MP3 from this folder*; the user can drop in Suno tracks (or anything) with zero code changes.

**Song: "Still on Shift"** — the game's anthem, sung from the crew's side. Cryptic, not expository: the song knows the count is wrong and does not know why either.

**Suno style prompt:** `Dark melodic hard rock, powerful haunting female lead vocal, aggressive driving verses, soaring mournful minor-key chorus, clean eerie hymn-like bridge with sonar pings and distant water ambience, heavy guitars, cinematic build, outro is a flat spoken voice reading a duty roster underwater, cut off mid-name. Mid-tempo, ~4 minutes.`

**Lyrics (full, paste-ready):**
```
[Verse 1]
Came down in 'sixty-four with lamps and ledger lines
Cut the dark for something warm the paperwork declines
The muster said us forty-one, the echo said one more
We stopped taking count that spring — the count was right before

[Pre-Chorus]
Punch your card at the gates of the black
The foreman's book is wet
Every name goes down the line
And the line's not finished yet

[Chorus]
We're still on shift — down in the black
The daylight closed in 'sixty-eight and it's never coming back
Still on shift — the water's keeping time
Two hundred by the tally, boys
Three hundred by the line

[Verse 2]
The Pile eats thinner every month and never dims her blue
The doctor timed us in our sleep and caught his own wrist too
There's toys nobody sent for, signed in a steady hand
And two brass bells stand empty watch for something in the sand

[Pre-Chorus]
Punch your card at the gates of the black
Third bell of the drowning day
The names go down in order
And one name won't go away

[Chorus]
We're still on shift — down in the black
The daylight closed in 'sixty-eight and it's never coming back
Still on shift — the water's keeping time
Two hundred by the tally, boys
Three hundred by the line

[Bridge — slow, hymnal]
A stranger swims the morning down, a spool of white unwinds
He tells us each what he's about — courteous, and kind
He'll carry out the warm one, he'll carry up the cold
He counts us on his fingers... and comes up one man over

[Final Chorus — half-time, huge]
Off the shift — the ledger's closed
Forty-one came off the books the morning that he rose
Off the shift — but hear the bell decline:
Someone's still down there counting
Two hundred... three hundred... down the line

[Outro — flat spoken voice, underwater, fading]
Albrecht, forward watch. Ames, galley. Barrow, lamps. Bell, stores. Calloway—
```

## 7. Gemini image manifest (generate at M8; textured quads in-world; procedural canvas-text fallbacks so nothing blocks on quality)

Global style suffix for every prompt: *"1960s US Navy print ephemera, offset-print grain, aged and water-stained, muted period palette, worn edges, no modern typography, no watermarks."*

**Readability rules:** every poster is designed **bold-headline-first** (large type, high contrast, minimal body text) because it will be read by flashlight in murk — and every poster/blueprint/photo supports **inspect** (look + E → fullscreen overlay of the texture). Text in generated images is decorative; any text the player must *understand* is rendered as a real subtitle/caption in the overlay, so garbled AI lettering can never break comprehension.

| ID | Image | Used | Aspect |
|---|---|---|---|
| G1 | Site BLACKWATER patch: anglerfish curled around a trident, ring text "NAVSITE BLACKWATER — CORMORANT" | Menus, hatches, HUD corner | 1:1 |
| G2 | Title key art: sinkhole shaft of daylight into black water, tiny diver descending | Title screen | 16:9 |
| G3 | Poster "YOUR LINE IS YOUR LIFE — LAY IT. TRUST IT." diver + guide line diagram | Galleries/Maze walls | 2:3 |
| G4 | Poster "SLOW IS SMOOTH — SILT KILLS" fin technique diagram | near silty chambers | 2:3 |
| G5 | Poster "RESPECT THE PILE — PROCEDURE IS PROTECTION" reactor pictogram, blue accent | Pile room | 2:3 |
| G6 | Poster "DRAUGHT RATION IS NOT OPTIONAL" cheerful sailor + canister | dispensaries | 2:3 |
| G7 | Poster "REQUISITION ROULETTE — ONE PULL PER MAN PER BELL" crate + dice | box spots | 2:3 |
| G8 | Notice "MISSING: E. HALVERSEN, LAMP-MAN — LAST SEEN BELOW" small photo, curling. *(Caption note on inspect: no Halversen appears in the crew book. This never reconciles with T1's "one over." It isn't supposed to.)* | Maze, late-game dread | 3:4 |
| G9 | Perk canister labels ×9 — generated **individually** (one prompt per perk from DESIGN §10.5: name, icon motif, color cap), not as a sheet to slice | perk stations | 1:1 ×9 |
| G10 | Site schematic blueprint, pre-flood: **accurate for the built facility portions, hand-sketched and openly uncertain for natural cave** (dotted lines, "?", grease-pencil annotations like "COLLAPSED", "DO NOT USE") — honest about what it doesn't know; the confusing natural passages stay unmapped | spawn platform + menu | 3:2 |
| G11 | Crew photo: a large group of men in dive/work gear on the platform, 1966 — prompt says "a few dozen," never an exact count. One face circled in grease pencil. **No note says why, and no one ever counts this photograph the same twice — Lowe included (T1 reaction). The generator's inability to render an exact count is the point.** | camp + ending | 3:2 |
| G12 | Jukebox faceplate + "REC ROOM — 1900–2100 — BE A GENTLEMAN" sign | rec room | 1:1, 3:1 |

## 8. Naming & stencil glossary
**BLACKWATER** (site) · **CORMORANT** (the dig; mission paragraph redacted everywhere it appears) · **THERMAL-1 / "the Heart"** (the crew's chalk, not an official name) · **the Pile** (reactor) · **the Bench** (PaP) · **Draughts** (perks) · **Requisition Roulette** (box) · **the 41** (the crew, per the roster) · **the count** (never say "the 42nd" in any player-facing text — the game only ever shows arithmetic that comes out wrong) · bells, not hours ("third bell") · Lowe's rig is 2008-mundane: no callsigns, no acronyms — a careful tradesman in a government ghost story.
